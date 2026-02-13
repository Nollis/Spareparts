import "dotenv/config";
import express from "express";
import multer from "multer";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import AdmZip from "adm-zip";
import { parse } from "csv-parse/sync";
import { registerCeRoutes } from "./ce-api.js";
import { initDb, queryAll, queryGet, queryRun, isPostgres, getDb } from "./db.js";
import {
  normalizeHeader,
  parseCsv,
  validateProductImport,
  validateZipImages
} from "./import-validation.js";
import {
  JSON_CONTRACT_VERSION,
  validateCategoriesJson,
  validateProductsJson,
  validatePriceSettingsJson,
  validateMachineCategoriesJson,
  writeJsonValidated,
  writeContractManifest
} from "./json-contract.js";
import * as storage from "./storage.js";

import cors from "cors";
const app = express();
app.use(cors());

const port = Number(process.env.MANAGER_API_PORT || 8788);
const dataDir = process.env.MANAGER_DATA_DIR || resolve("data");
const tmpDir = process.env.MANAGER_TMP_DIR || resolve(dataDir, "tmp");
const categoryImagesDir =
  process.env.MANAGER_CATEGORY_IMAGES_DIR || resolve(dataDir, "images", "spare-part-images");
const catalogImagesDir =
  process.env.MANAGER_CATALOG_IMAGES_DIR || resolve(dataDir, "images", "product-catalog-images");
const outputDir = process.env.MANAGER_OUTPUT_DIR || resolve("output");
const jsonDir = process.env.MANAGER_JSON_DIR || resolve(outputDir, "json");
const publicBaseUrl = (process.env.MANAGER_PUBLIC_BASE_URL || "").trim();
const wpCacheDir =
  process.env.MANAGER_WP_CACHE_DIR ||
  "F:\\Spareparts\\wp-content\\plugins\\wccd-api\\includes\\api\\v1\\cached-json-results";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 }
});

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

ensureDir(dataDir);
ensureDir(tmpDir);
if (!storage.useSpacesStorage()) {
  ensureDir(categoryImagesDir);
  ensureDir(catalogImagesDir);
  ensureDir(outputDir);
  ensureDir(jsonDir);
}


function loadWpCachedCategories(mainKey) {
  if (!mainKey) return null;
  if (!wpCacheDir || !existsSync(wpCacheDir)) return null;
  const filePath = resolve(wpCacheDir, `categories-${mainKey}.json`);
  if (!existsSync(filePath)) return null;
  try {
    const raw = readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    console.warn("Failed to read WP cached categories:", error?.message || error);
    return null;
  }
}

await initDb();

function clampLimit(value, fallback = 200, max = 500) {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return Math.min(Math.max(parsed, 1), max);
}

function normalizeBoolean(value) {
  if (value === true || value === 1 || value === "1" || value === "true") {
    return 1;
  }
  return 0;
}

async function getSetting(key, fallbackValue = null) {
  const row = await queryGet("SELECT value FROM settings WHERE key = ?", [key]);
  if (!row || !row.value) {
    return fallbackValue;
  }
  try {
    return JSON.parse(row.value);
  } catch (error) {
    return fallbackValue;
  }
}

async function setSetting(key, value) {
  const payload = JSON.stringify(value ?? null);
  await queryRun(
    `INSERT INTO settings (key, value, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    [key, payload]
  );
}

function normalizeText(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim();
}

const SESSION_COOKIE = "sp_session";
const SESSION_TTL_DAYS = 30;

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash) return false;
  const parts = String(storedHash).split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, hash] = parts;
  const testHash = scryptSync(password, salt, 64).toString("hex");
  try {
    return timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(testHash, "hex"));
  } catch {
    return false;
  }
}

function hashSessionToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function parseCookies(req) {
  const header = req.headers?.cookie;
  if (!header) return {};
  return header.split(";").reduce((acc, part) => {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (!rawKey) return acc;
    acc[rawKey] = decodeURIComponent(rawValue.join("="));
    return acc;
  }, {});
}

function setSessionCookie(req, res, token, maxAgeSeconds) {
  const secure = req.secure || req.headers["x-forwarded-proto"] === "https";
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`
  ];
  if (secure) {
    parts.push("Secure");
  }
  res.setHeader("Set-Cookie", parts.join("; "));
}

function clearSessionCookie(res) {
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  );
}

async function cleanupExpiredSessions() {
  await queryRun("DELETE FROM sessions WHERE expires_at <= datetime('now')");
}

async function buildUserResponse(userRow) {
  if (!userRow) return null;
  const company = userRow.company_id
    ? await queryGet(
      "SELECT id, name, customer_number, discount_percent, country_code, no_pyramid_import FROM companies WHERE id = ?",
      [userRow.company_id]
    )
    : null;
  const deliveryAddresses = company
    ? await queryAll(
      `SELECT id, attn_first_name, attn_last_name, street, street_2, zip_code, postal_area, country, delivery_id
         FROM delivery_addresses WHERE company_id = ? ORDER BY id ASC`,
      [company.id]
    )
    : [];
  return {
    id: userRow.id,
    email: userRow.email,
    first_name: userRow.first_name || "",
    last_name: userRow.last_name || "",
    phone: userRow.phone || "",
    status: userRow.status,
    is_order_manager: Boolean(userRow.is_order_manager),
    is_ce_admin: Boolean(userRow.is_ce_admin),
    selected_delivery_address_id: userRow.selected_delivery_address_id || null,
    billing: {
      name: userRow.billing_name || "",
      street: userRow.billing_street || "",
      street_2: userRow.billing_street_2 || "",
      zip_code: userRow.billing_zip_code || "",
      postal_area: userRow.billing_postal_area || "",
      country: userRow.billing_country || "",
      email: userRow.billing_email || "",
      org_number: userRow.billing_org_number || ""
    },
    shipping: {
      attn_first_name: userRow.shipping_attn_first_name || "",
      attn_last_name: userRow.shipping_attn_last_name || "",
      street: userRow.shipping_street || "",
      street_2: userRow.shipping_street_2 || "",
      zip_code: userRow.shipping_zip_code || "",
      postal_area: userRow.shipping_postal_area || "",
      country: userRow.shipping_country || ""
    },
    company,
    delivery_addresses: deliveryAddresses
  };
}

async function getAuthenticatedUser(req) {
  await cleanupExpiredSessions();
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE];
  if (!token) return null;
  const tokenHash = hashSessionToken(token);
  const session = await queryGet(
    `SELECT s.id, s.user_id, s.expires_at, u.*
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.session_hash = ?`,
    [tokenHash]
  );
  if (!session) return null;
  const isExpired = (await queryGet("SELECT datetime('now') >= ? AS expired", [session.expires_at]))?.expired;
  if (isExpired) {
    await queryRun("DELETE FROM sessions WHERE id = ?", [session.id]);
    return null;
  }
  await queryRun("UPDATE sessions SET last_seen_at = datetime('now') WHERE id = ?", [session.id]);
  return session;
}

function parseLangList(value) {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizeText(entry).toLowerCase())
      .filter((entry) => entry && entry !== "");
  }
  const raw = normalizeText(value);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .map((entry) => normalizeText(entry).toLowerCase())
        .filter((entry) => entry && entry !== "");
    }
  } catch (error) {
    // fall through to comma split
  }
  return raw
    .split(",")
    .map((entry) => normalizeText(entry).toLowerCase())
    .filter((entry) => entry && entry !== "");
}

function createKeyFromPath(pathValue) {
  return normalizeText(pathValue).replace(/\\/g, "-").toLowerCase();
}

function sanitizeFileName(fileName) {
  let result = String(fileName || "").trim().toLowerCase();
  result = result.replace(/\u00c3\u00a5|\u00e5/g, "a");
  result = result.replace(/\u00c3\u00a4|\u00e4/g, "a");
  result = result.replace(/\u00c3\u00b6|\u00f6/g, "o");
  result = result.replace(/\s+/g, "_");
  result = result.replace(/--/g, "-");
  result = result.replace(/%20/g, "_");
  result = result.replace(/\[comma\]/gi, ",");
  result = result.replace(/[^a-z0-9_-]/g, "");
  return result;
}

function slugify(value) {
  const base = sanitizeFileName(value).replace(/_/g, "-");
  return base.replace(/-+/g, "-");
}

function normalizeCurrencyCode(value) {
  return normalizeText(value).toUpperCase().replace(/[^A-Z]/g, "");
}

async function getPriceCurrencySettings() {
  const defaultSettings = {
    baseCurrency: "SEK",
    currencies: [{ code: "SEK", name: "Swedish krona", rate: 1 }]
  };
  return getSetting("price_currency", defaultSettings);
}

function buildPriceCurrencySettings(payload) {
  const baseCurrency = normalizeCurrencyCode(payload?.baseCurrency);
  if (!baseCurrency) {
    return { error: "Base currency is required." };
  }
  const list = Array.isArray(payload?.currencies) ? payload.currencies : [];
  const currencies = [];
  const seen = new Set();

  list.forEach((item) => {
    const code = normalizeCurrencyCode(item?.code);
    if (!code || seen.has(code)) {
      return;
    }
    const name = normalizeText(item?.name);
    let rate = Number(item?.rate);
    if (Number.isNaN(rate)) {
      rate = "";
    } else {
      rate = Number(rate.toFixed(6));
    }
    currencies.push({ code, name, rate });
    seen.add(code);
  });

  if (!seen.has(baseCurrency)) {
    currencies.unshift({ code: baseCurrency, name: "", rate: 1 });
  }

  currencies.forEach((entry) => {
    if (entry.code === baseCurrency) {
      entry.rate = 1;
    }
  });

  return { baseCurrency, currencies };
}

function clearDirectory(path) {
  if (!existsSync(path)) {
    ensureDir(path);
    return;
  }
  try {
    const entries = readdirSync(path, { withFileTypes: true });
    entries.forEach((entry) => {
      rmSync(resolve(path, entry.name), { recursive: true, force: true });
    });
  } catch (error) {
    try {
      rmSync(path, { recursive: true, force: true });
      ensureDir(path);
      return;
    } catch (innerError) {
      const message = error?.message || error;
      throw new Error(`Failed to clear directory: ${path}. ${message}`);
    }
  }
}

function resolveParentKey(pathValue) {
  const parts = normalizeText(pathValue).split("\\").filter(Boolean);
  if (parts.length <= 1) {
    return "";
  }
  const parentPath = parts.slice(0, -1).join("\\");
  return createKeyFromPath(parentPath);
}


async function upsertCategory(key, path, nameSv, descSv, nameEn, descEn, namePl, descPl, position, parentKey, isMain, catalogImage) {
  await queryRun(
    `INSERT INTO categories (key, path, name_sv, desc_sv, name_en, desc_en, name_pl, desc_pl, position, parent_key, is_main, catalog_image, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET
       path = excluded.path,
       name_sv = excluded.name_sv,
       desc_sv = excluded.desc_sv,
       name_en = excluded.name_en,
       desc_en = excluded.desc_en,
       name_pl = COALESCE(excluded.name_pl, categories.name_pl),
       desc_pl = COALESCE(excluded.desc_pl, categories.desc_pl),
       position = excluded.position,
       parent_key = excluded.parent_key,
       is_main = excluded.is_main,
       catalog_image = COALESCE(excluded.catalog_image, categories.catalog_image),
       updated_at = datetime('now')`,
    [key, path, nameSv, descSv, nameEn, descEn, namePl, descPl, position, parentKey, isMain, catalogImage]
  );
}

async function upsertProduct(sku, nameSv, descSv, nameEn, descEn, namePl, descPl, price) {
  await queryRun(
    `INSERT INTO products (sku, name_sv, desc_sv, name_en, desc_en, name_pl, desc_pl, price, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(sku) DO UPDATE SET
       name_sv = excluded.name_sv,
       desc_sv = excluded.desc_sv,
       name_en = excluded.name_en,
       desc_en = excluded.desc_en,
       name_pl = COALESCE(excluded.name_pl, products.name_pl),
       desc_pl = COALESCE(excluded.desc_pl, products.desc_pl),
       price = COALESCE(excluded.price, products.price),
       updated_at = datetime('now')`,
    [sku, nameSv, descSv, nameEn, descEn, namePl, descPl, price]
  );
}

async function insertProductCategory(productSku, categoryKey, posNum, noUnits) {
  await queryRun(
    "INSERT OR IGNORE INTO product_categories (product_sku, category_key, pos_num, no_units) VALUES (?, ?, ?, ?)",
    [productSku, categoryKey, posNum, noUnits]
  );
}

async function importZip(buffer) {
  const zip = new AdmZip(buffer);
  let count = 0;
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    const ext = extname(entry.entryName).toLowerCase();
    if (!ext) continue;
    const base = sanitizeFileName(basename(entry.entryName, ext));
    if (!base) continue;
    const outputName = `${base}${ext}`;
    await storage.put("category-images", outputName, entry.getData());
    count += 1;
  }
  return count;
}

async function saveCatalogImage(buffer, originalName, mainKey) {
  if (!mainKey) {
    return "";
  }
  const ext = extname(originalName).toLowerCase() || ".jpg";
  const fileName = `product_catalog_image-${mainKey}${ext}`;
  await storage.put("catalog-images", fileName, buffer);
  await queryRun("UPDATE categories SET catalog_image = ?, updated_at = datetime('now') WHERE key = ?", [
    fileName,
    mainKey
  ]);
  return fileName;
}

async function removeCatalogImage(fileName) {
  if (!fileName) return;
  const safeName = basename(fileName);
  const ok = await storage.exists("catalog-images", safeName);
  if (ok) await storage.remove("catalog-images", safeName);
}

function collectImageBasesForCategory(key, pathValue = "") {
  const bases = new Set();
  if (key) {
    bases.add(key);
    bases.add(sanitizeFileName(key));
  }
  if (pathValue) {
    const parts = normalizeText(pathValue).split("\\").filter(Boolean);
    const leaf = parts.length ? parts[parts.length - 1] : "";
    if (leaf) {
      const lowerLeaf = leaf.toLowerCase();
      bases.add(lowerLeaf);
      bases.add(sanitizeFileName(lowerLeaf));
    }
  }
  return bases;
}

async function removeCategoryImagesByBases(baseNames) {
  if (!baseNames || baseNames.size === 0) return 0;
  const files = await storage.list("category-images", "");
  let removed = 0;
  for (const name of files) {
    const base = sanitizeFileName(basename(name, extname(name)));
    if (baseNames.has(base)) {
      await storage.remove("category-images", name);
      removed += 1;
    }
  }
  return removed;
}

async function findImageForKey(key, pathValue = "") {
  const variants = [];
  if (key) variants.push(key, sanitizeFileName(key));
  if (pathValue) {
    const parts = normalizeText(pathValue).split("\\").filter(Boolean);
    const leaf = parts.length ? parts[parts.length - 1] : "";
    if (leaf) {
      const lowerLeaf = leaf.toLowerCase();
      variants.push(lowerLeaf, sanitizeFileName(lowerLeaf));
    }
  }
  const unique = Array.from(new Set(variants.filter(Boolean)));
  const exts = [".jpg", ".jpeg", ".png", ".gif", ".svg"];
  for (const base of unique) {
    for (const ext of exts) {
      const fileName = `${base}${ext}`;
      const ok = await storage.exists("category-images", fileName);
      if (ok) return fileName;
    }
  }
  return "";
}

function buildPublicUrl(relativePath) {
  if (!relativePath) return "";
  const normalized = relativePath.startsWith("/") ? relativePath.slice(1) : relativePath;
  const pathMap = [
    ["images/spare-part-images/", "category-images"],
    ["images/product-catalog-images/", "catalog-images"],
    ["json/", "json"],
    ["files/", "output"]
  ];
  for (const [prefix, store] of pathMap) {
    if (normalized.startsWith(prefix)) {
      const key = normalized.slice(prefix.length);
      return storage.getPublicUrl(store, key) || `/${normalized}`;
    }
  }
  return `/${normalized}`;
}

function getJsonDest(filename) {
  if (storage.useSpacesStorage()) return { store: "json", key: filename };
  return resolve(jsonDir, filename);
}

function imageMapHasHotspots(html) {
  if (!html) {
    return false;
  }
  return /<area\b/i.test(html);
}

async function getImageMapRow(categoryKey) {
  return queryGet(
    "SELECT id, category_key, html, updated_at FROM image_maps WHERE category_key = ?",
    [categoryKey]
  );
}

async function upsertImageMap(categoryKey, html, updatedAt = null) {
  await queryRun(
    `INSERT INTO image_maps (category_key, html, updated_at)
     VALUES (?, ?, COALESCE(?, datetime('now')))
     ON CONFLICT(category_key) DO UPDATE SET
       html = excluded.html,
       updated_at = COALESCE(excluded.updated_at, datetime('now'))`,
    [categoryKey, html, updatedAt]
  );
}

function buildPosLabel(position, name) {
  const posValue = position ? String(position) : "0";
  const trimmed = normalizeText(name);
  if (trimmed.length >= 2 && trimmed[1] === " ") {
    const letter = trimmed[0].toUpperCase();
    if (letter >= "A" && letter <= "Z") {
      return `${posValue}${letter}`;
    }
  }
  return posValue;
}

async function getChildCategoriesWithLabels(parentKey) {
  const rows = await queryAll(
    `SELECT key, name_sv, name_en, position
     FROM categories
     WHERE parent_key = ?
     ORDER BY position ASC, id ASC`,
    [parentKey]
  );
  const labels = rows.map((row) =>
    buildPosLabel(row.position, row.name_sv || row.name_en || row.key)
  );
  const counts = labels.reduce((acc, label) => {
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {});
  const hasDuplicates = Object.values(counts).some((count) => count > 1);
  return rows.map((row, index) => {
    const name = row.name_sv || row.name_en || row.key;
    const posLabel = buildPosLabel(row.position, name);
    const displayLabel = hasDuplicates ? String(index + 1) : posLabel;
    return {
      key: row.key,
      name,
      position: row.position ? String(row.position) : "0",
      pos_label: posLabel,
      display_label: displayLabel
    };
  });
}

async function getProductsForCategoryKey(categoryKey) {
  const rows = await queryAll(
    `SELECT p.sku, p.name_sv, p.name_en, p.name_pl, p.desc_sv, p.desc_en, p.desc_pl, pc.pos_num, p.price, pc.no_units
     FROM products p
     JOIN product_categories pc ON pc.product_sku = p.sku
     WHERE pc.category_key = ?
     ORDER BY pc.pos_num ASC, p.sku ASC`,
    [categoryKey]
  );

  const productList = rows.map((row) => ({
    sku: row.sku,
    name: row.name_sv || row.name_en || row.sku,
    lang_name: {
      se: row.name_sv || "",
      en: row.name_en || "",
      pl: row.name_pl || ""
    },
    lang_desc: {
      se: row.desc_sv || "",
      en: row.desc_en || "",
      pl: row.desc_pl || ""
    },
    pos_num: row.pos_num || 0,
    price: row.price || "",
    no_units: row.no_units || ""
  }));

  // Logic mirroring WordPress Included Parts handling (Begin Marker > and End Marker <)
  const mainProducts = productList.filter((p) => p.pos_num > 0);
  const includedParts = productList.filter(
    (p) => p.pos_num === 0 && p.sku !== ">" && p.sku !== "<"
  );
  const beginMarker = productList.find((p) => p.sku === ">" && p.pos_num === 0);
  const endMarker = productList.find((p) => p.sku === "<" && p.pos_num === 0);

  const finalResult = [...mainProducts];
  if (includedParts.length > 0) {
    if (beginMarker) finalResult.push(beginMarker);
    finalResult.push(...includedParts);
    if (endMarker) finalResult.push(endMarker);
  }

  return finalResult.map((p) => ({
    ...p,
    pos_num: String(p.pos_num)
  }));
}

async function generateJsonForMainKey(mainKey) {
  const likePattern = `${mainKey}-%`;
  let categories = await queryAll(
    "SELECT * FROM categories WHERE key = ? OR key LIKE ? ORDER BY position ASC, id ASC",
    [mainKey, likePattern]
  );
  const wpCategories = loadWpCachedCategories(mainKey);
  const wpById = new Map();
  const wpParentBySlug = new Map();
  const wpPosBySlug = new Map();
  const allowedKeys = new Set();
  if (Array.isArray(wpCategories)) {
    wpCategories.forEach((cat) => {
      const slug = normalizeText(cat?.slug || cat?.key);
      if (slug) {
        allowedKeys.add(slug);
      }
      if (cat?.id) {
        wpById.set(cat.id, cat);
      }
    });
    wpCategories.forEach((cat) => {
      const slug = normalizeText(cat?.slug || cat?.key);
      if (!slug) return;
      const parent = cat.parent ? wpById.get(cat.parent) : null;
      if (parent) {
        const parentSlug = normalizeText(parent.slug || parent.key || "");
        if (parentSlug) {
          wpParentBySlug.set(slug, parentSlug);
        }
      }
      const posNum = cat?.pos_num;
      if (posNum !== undefined && posNum !== null && String(posNum).trim() !== "") {
        wpPosBySlug.set(slug, String(posNum));
      }
    });
  }
  if (allowedKeys.size > 0) {
    categories = categories.filter((cat) => allowedKeys.has(cat.key));
  }

  const categoryByKey = new Map(categories.map((cat) => [cat.key, cat]));
  const categoryIdByKey = new Map(categories.map((cat) => [cat.key, cat.id]));

  const categoryItems = await Promise.all(
    categories.map(async (cat) => {
      const name = cat.name_sv || cat.name_en || cat.key;
      const wpParentKey = wpParentBySlug.get(cat.key) || "";
      const parentIdFromWp = wpParentKey ? categoryIdByKey.get(wpParentKey) || 0 : 0;
      const parentId = parentIdFromWp || (cat.parent_key ? categoryIdByKey.get(cat.parent_key) || 0 : 0);
      const imageFile = await findImageForKey(cat.key, cat.path);
      const imageSrc = imageFile ? buildPublicUrl(`/images/spare-part-images/${imageFile}`) : "";
    const catalogSrc = cat.catalog_image
      ? buildPublicUrl(`/images/product-catalog-images/${cat.catalog_image}`)
      : "";
    const wpPos = wpPosBySlug.get(cat.key);
    const positionValue = wpPos ? Number(wpPos) : cat.position || 0;
    const posNumValue = wpPos ? String(wpPos) : cat.position ? String(cat.position) : "";
    const item = {
      id: cat.id,
      name,
      key: cat.key,
      parent: parentId,
      description: "",
      display: "products",
      menu_order: positionValue,
      count: 0,
      lang_name: {
        se: cat.name_sv || "",
        en: cat.name_en || "",
        pl: cat.name_pl || ""
      },
      lang_desc: {
        se: cat.desc_sv || "",
        en: cat.desc_en || "",
        pl: cat.desc_pl || ""
      },
      products: [],
      product_catalog_image_url: cat.is_main ? catalogSrc : "",
      pos_num: posNumValue,
      position: positionValue,
      image: imageSrc ? { src: imageSrc } : {}
    };
      return item;
    })
  );

  const productRows = await queryAll(
    `SELECT p.*, pc.category_key, pc.pos_num, pc.no_units
     FROM products p
     JOIN product_categories pc ON pc.product_sku = p.sku
     WHERE pc.category_key = ? OR pc.category_key LIKE ?
     ORDER BY pc.pos_num ASC, p.sku ASC`,
    [mainKey, likePattern]
  );

  const productsMap = new Map();
  for (const row of productRows) {
    // Use composite key to allow same SKU at multiple positions
    const mapKey = `${row.sku}|${row.category_key}|${row.pos_num}`;
    if (!productsMap.has(mapKey)) {
      productsMap.set(mapKey, {
        id: row.id,
        sku: row.sku,
        name: row.name_sv || row.name_en || row.sku,
        price: row.price || "",
        regular_price: "",
        sale_price: "",
        low_stock_amount: null,
        categories: [],
        menu_order: 0,
        has_options: false,
        lang_name: {
          se: row.name_sv || "",
          en: row.name_en || "",
          pl: row.name_pl || ""
        },
        lang_desc: {
          se: row.desc_sv || "",
          en: row.desc_en || "",
          pl: row.desc_pl || ""
        },
        pos_num: row.pos_num ? String(row.pos_num) : "",
        no_units: row.no_units || ""
      });
    }
    const product = productsMap.get(mapKey);
    const category = categoryByKey.get(row.category_key);
    if (category) {
      product.categories.push({
        id: category.id,
        name: category.name_sv || category.name_en || category.key,
        key: category.key,
        pos_num: row.pos_num ? String(row.pos_num) : "0",
        no_units: row.no_units || ""
      });
    }
  }

  const productItems = Array.from(productsMap.values());

  const categoriesKey = `categories-${mainKey}.json`;
  const productsKey = `products-${mainKey}.json`;
  await writeJsonValidated(getJsonDest(categoriesKey), categoryItems, validateCategoriesJson, "categories export");
  await writeJsonValidated(getJsonDest(productsKey), productItems, validateProductsJson, "products export");
  return [categoriesKey, productsKey];
}

async function generatePriceSettingsJson() {
  const settings = await getPriceCurrencySettings();
  await writeJsonValidated(getJsonDest("price-settings.json"), settings, validatePriceSettingsJson, "price settings export");
  return "price-settings.json";
}

async function generateMachineCategoriesJson() {
  const items = await getMachineCategoryHierarchy();
  await writeJsonValidated(getJsonDest("machine-categories.json"), items, validateMachineCategoriesJson, "machine categories export");
  return "machine-categories.json";
}

async function getMainProducts() {
  return queryAll("SELECT key, name_sv, name_en FROM categories WHERE is_main = 1 ORDER BY position ASC, id ASC");
}

async function listCategories({ query = "", limit = 200 } = {}) {
  const term = `%${query}%`;
  return queryAll(
    `SELECT id, key, path, parent_key, is_main, position, name_sv, desc_sv, name_en, desc_en, name_pl, desc_pl
     FROM categories
     WHERE ? = '' OR key LIKE ? OR path LIKE ? OR name_sv LIKE ? OR name_en LIKE ? OR desc_sv LIKE ? OR desc_en LIKE ?
     ORDER BY id ASC
     LIMIT ?`,
    [query, term, term, term, term, term, term, clampLimit(limit)]
  );
}

async function listProducts({ query = "", limit = 200 } = {}) {
  const term = `%${query}%`;
  const items = await queryAll(
    `SELECT sku AS id, sku, name_sv, desc_sv, name_en, desc_en, name_pl, desc_pl, price
     FROM products
     WHERE ? = '' OR sku LIKE ? OR name_sv LIKE ? OR name_en LIKE ? OR desc_sv LIKE ? OR desc_en LIKE ?
     ORDER BY sku ASC
     LIMIT ?`,
    [query, term, term, term, term, term, clampLimit(limit)]
  );
  if (!items.length) {
    return [];
  }
  const skuList = items.map((item) => item.sku);
  const placeholders = skuList.map(() => "?").join(", ");
  const categoryRows = await queryAll(
    `SELECT product_sku, category_key FROM product_categories WHERE product_sku IN (${placeholders})`,
    skuList
  );
  const categoriesBySku = new Map();
  categoryRows.forEach((row) => {
    if (!categoriesBySku.has(row.product_sku)) {
      categoriesBySku.set(row.product_sku, []);
    }
    categoriesBySku.get(row.product_sku).push(row.category_key);
  });
  return items.map((item) => ({
    ...item,
    name: item.name_sv || item.name_en || item.sku,
    lang_name: {
      se: item.name_sv || "",
      en: item.name_en || "",
      pl: item.name_pl || ""
    },
    lang_desc: {
      se: item.desc_sv || "",
      en: item.desc_en || "",
      pl: item.desc_pl || ""
    },
    categories: categoriesBySku.get(item.sku) || []
  }));
}

async function getMachineCategoryLinks(machineCategoryIds) {
  if (!machineCategoryIds.length) {
    return new Map();
  }
  const placeholders = machineCategoryIds.map(() => "?").join(", ");
  const linkRows = await queryAll(
    `SELECT machine_category_id, category_key, position, show_for_lang
     FROM machine_category_product_categories
     WHERE machine_category_id IN (${placeholders})
     ORDER BY position ASC`,
    machineCategoryIds
  );
  const keys = Array.from(new Set(linkRows.map((row) => row.category_key).filter(Boolean)));
  const categoryByKey = new Map();
  if (keys.length) {
    const keyPlaceholders = keys.map(() => "?").join(", ");
    const categoryRows = await queryAll(
      `SELECT id, key, name_sv, name_en, catalog_image, position
       FROM categories
       WHERE key IN (${keyPlaceholders})`,
      keys
    );
    categoryRows.forEach((row) => {
      categoryByKey.set(row.key, row);
    });
  }

  const map = new Map();
  linkRows.forEach((row) => {
    if (!map.has(row.machine_category_id)) {
      map.set(row.machine_category_id, []);
    }
    const cat = categoryByKey.get(row.category_key);
    const name = cat ? cat.name_sv || cat.name_en || cat.key : row.category_key;
    const catalogUrl = cat?.catalog_image
      ? buildPublicUrl(`/images/product-catalog-images/${cat.catalog_image}`)
      : "";
    const showForLang = parseLangList(row.show_for_lang);
    map.get(row.machine_category_id).push({
      id: cat?.id || 0,
      key: row.category_key,
      slug: row.category_key,
      name,
      position:
        row.position !== null ? String(row.position) : cat?.position ? String(cat.position) : "0",
      lang_name: {
        se: cat?.name_sv || "",
        en: cat?.name_en || "",
        pl: cat?.name_pl || ""
      },
      lang_desc: {
        se: cat?.desc_sv || "",
        en: cat?.desc_en || "",
        pl: cat?.desc_pl || ""
      },
      product_catalog_image_url: catalogUrl,
      showForLang
    });
  });
  return map;
}

async function listMachineCategories({ query = "", limit = 200 } = {}) {
  const term = `%${query}%`;
  const rows = await queryAll(
    `SELECT id, key, parent_id, position, name_sv, name_en
     FROM machine_categories
     WHERE ? = '' OR key LIKE ? OR name_sv LIKE ? OR name_en LIKE ?
     ORDER BY position ASC, id ASC
     LIMIT ?`,
    [query, term, term, term, clampLimit(limit)]
  );
  const linkMap = await getMachineCategoryLinks(rows.map((row) => row.id));
  return rows.map((row) => ({
    ...row,
    product_categories: linkMap.get(row.id) || []
  }));
}

async function getMachineCategoryHierarchy() {
  const rows = await queryAll(
    `SELECT id, key, parent_id, position, name_sv, name_en
     FROM machine_categories
     ORDER BY position ASC, id ASC`
  );
  if (!rows.length) {
    return [];
  }
  const linkMap = await getMachineCategoryLinks(rows.map((row) => row.id));
  const items = rows.map((row) => {
    const name = row.name_sv || row.name_en || row.key;
    return {
      id: row.id,
      name,
      lang_name: {
        se: row.name_sv || "",
        en: row.name_en || "",
        pl: row.name_pl || ""
      },
      lang_desc: {
        se: row.desc_sv || "",
        en: row.desc_en || "",
        pl: row.desc_pl || ""
      },
      key: row.key,
      slug: row.key,
      count: 0,
      parent: row.parent_id || 0,
      taxonomy: "machine_category",
      menu_order: row.position ? String(row.position) : "0",
      isParentCategory: true,
      children: [],
      product_categories: linkMap.get(row.id) || []
    };
  });

  const byId = new Map(items.map((item) => [item.id, item]));
  const roots = [];
  items.forEach((item) => {
    if (item.parent && byId.has(item.parent)) {
      const parent = byId.get(item.parent);
      parent.children.push(item);
    } else {
      roots.push(item);
    }
  });

  roots.forEach((root) => {
    if (root.children.length === 0) {
      root.isParentCategory = false;
      delete root.children;
    } else {
      root.isParentCategory = true;
      root.children.forEach((child) => {
        child.isParentCategory = false;
        delete child.children;
      });
      delete root.product_categories;
    }
  });

  return roots;
}

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
if (storage.useSpacesStorage()) {
  app.get("/images/spare-part-images/:filename", (req, res) => {
    const fn = req.params.filename;
    if (!fn || fn.includes("..")) return res.status(400).end();
    const url = storage.getPublicUrl("category-images", fn);
    if (url?.startsWith("http")) return res.redirect(302, url);
    res.status(404).end();
  });
  app.get("/images/product-catalog-images/:filename", (req, res) => {
    const fn = req.params.filename;
    if (!fn || fn.includes("..")) return res.status(400).end();
    const url = storage.getPublicUrl("catalog-images", fn);
    if (url?.startsWith("http")) return res.redirect(302, url);
    res.status(404).end();
  });
  app.get("/json/:filename", async (req, res) => {
    const fn = req.params.filename;
    if (!fn || fn.includes("..")) return res.status(400).end();
    const data = await storage.get("json", fn);
    if (!data) return res.status(404).end();
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.send(data);
  });
  app.use("/files", express.static(outputDir));
} else {
  app.use("/files", express.static(outputDir));
  app.use("/images/spare-part-images", express.static(categoryImagesDir));
  app.use("/images/product-catalog-images", express.static(catalogImagesDir));
  app.use("/json", express.static(jsonDir));
}

app.get("/api/status", async (req, res) => {
  const categoryCount = (await queryGet("SELECT COUNT(*) AS count FROM categories")).count || 0;
  const productCount = (await queryGet("SELECT COUNT(*) AS count FROM products")).count || 0;
  const mainCount = (await queryGet("SELECT COUNT(*) AS count FROM categories WHERE is_main = 1")).count || 0;
  res.json({ categoryCount, productCount, mainCount });
});

app.get("/api/schema-versions", async (req, res) => {
  const versions = await queryAll(
    "SELECT version, applied_at FROM schema_versions ORDER BY applied_at ASC"
  );
  res.json({ versions });
});

app.get("/api/search", async (req, res) => {
  const query = normalizeText(req.query?.query);
  const lang = normalizeText(req.query?.lang) || "sv";
  const limit = clampLimit(req.query?.limit, 50, 200);
  if (!query) {
    res.json([]);
    return;
  }
  const term = `%${query}%`;
  const rows = await queryAll(
    `SELECT p.sku, p.name_sv, p.name_en, p.desc_sv, p.desc_en,
            c.key AS category_key, c.path AS category_path
     FROM products p
     LEFT JOIN product_categories pc ON pc.product_sku = p.sku
     LEFT JOIN categories c ON c.key = pc.category_key
     WHERE p.sku LIKE ?
        OR p.name_sv LIKE ? OR p.name_en LIKE ?
        OR p.desc_sv LIKE ? OR p.desc_en LIKE ?
     ORDER BY p.sku ASC
     LIMIT ?`,
    [term, term, term, term, term, limit]
  );
  const items = rows.map((row) => ({
    sku: row.sku,
    name: lang === "en" ? row.name_en || row.name_sv : row.name_sv || row.name_en,
    category: row.category_path || "",
    category_key: row.category_key || ""
  }));
  res.json(items);
});

// Admin - Users
app.get("/api/admin/users", async (req, res) => {
  const rows = await queryAll(
    `SELECT u.id, u.email, u.first_name, u.last_name, u.phone, u.status,
            u.is_order_manager, u.is_ce_admin, u.company_id,
            c.name AS company_name
     FROM users u
     LEFT JOIN companies c ON c.id = u.company_id
     ORDER BY u.id DESC`
  );
  res.json(rows);
});

app.post("/api/admin/users", async (req, res) => {
  const email = normalizeText(req.body?.email).toLowerCase();
  const password = normalizeText(req.body?.password);
  if (!email || !password) {
    res.status(400).send("Email and password are required.");
    return;
  }
  const firstName = normalizeText(req.body?.first_name);
  const lastName = normalizeText(req.body?.last_name);
  const phone = normalizeText(req.body?.phone);
  const status = normalizeText(req.body?.status) || "active";
  const companyId = req.body?.company_id ? Number(req.body.company_id) : null;
  const isOrderManager = normalizeBoolean(req.body?.is_order_manager);
  const isCeAdmin = normalizeBoolean(req.body?.is_ce_admin);

  await queryRun(
    `INSERT INTO users (
       email, password_hash, first_name, last_name, phone, status, company_id,
       is_order_manager, is_ce_admin, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    [
      email,
      hashPassword(password),
      firstName,
      lastName,
      phone,
      status,
      companyId,
      isOrderManager,
      isCeAdmin
    ]
  );
  res.json({ ok: true });
});

app.put("/api/admin/users/:id", async (req, res) => {
  const id = Number(req.params?.id);
  if (!id) {
    res.status(400).send("Invalid user id.");
    return;
  }
  const firstName = normalizeText(req.body?.first_name);
  const lastName = normalizeText(req.body?.last_name);
  const phone = normalizeText(req.body?.phone);
  const status = normalizeText(req.body?.status) || "active";
  const companyId = req.body?.company_id ? Number(req.body.company_id) : null;
  const isOrderManager = normalizeBoolean(req.body?.is_order_manager);
  const isCeAdmin = normalizeBoolean(req.body?.is_ce_admin);
  const email = normalizeText(req.body?.email).toLowerCase();
  const password = normalizeText(req.body?.password);

  await queryRun(
    `UPDATE users SET
      email = ?,
      first_name = ?,
      last_name = ?,
      phone = ?,
      status = ?,
      company_id = ?,
      is_order_manager = ?,
      is_ce_admin = ?,
      updated_at = datetime('now')
     WHERE id = ?`,
    [
      email,
      firstName,
      lastName,
      phone,
      status,
      companyId,
      isOrderManager,
      isCeAdmin,
      id
    ]
  );

  if (password) {
    await queryRun(
      `UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`,
      [hashPassword(password), id]
    );
  }

  res.json({ ok: true });
});

app.delete("/api/admin/users/:id", async (req, res) => {
  const id = Number(req.params?.id);
  if (!id) {
    res.status(400).send("Invalid user id.");
    return;
  }
  await queryRun("DELETE FROM sessions WHERE user_id = ?", [id]);
  await queryRun("DELETE FROM users WHERE id = ?", [id]);
  res.json({ ok: true });
});

// Admin - Companies
app.get("/api/admin/companies", async (req, res) => {
  const rows = await queryAll(
    `SELECT id, name, customer_number, discount_percent, country_code, no_pyramid_import
     FROM companies ORDER BY name ASC`
  );
  res.json(rows);
});

app.post("/api/admin/companies", async (req, res) => {
  const name = normalizeText(req.body?.name);
  if (!name) {
    res.status(400).send("Company name is required.");
    return;
  }
  const customerNumber = normalizeText(req.body?.customer_number);
  const discount = Number(req.body?.discount_percent || 0);
  const country = normalizeText(req.body?.country_code);
  const noPyramid = normalizeBoolean(req.body?.no_pyramid_import);

  await queryRun(
    `INSERT INTO companies (name, customer_number, discount_percent, country_code, no_pyramid_import, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    [name, customerNumber, discount, country, noPyramid]
  );
  res.json({ ok: true });
});

app.put("/api/admin/companies/:id", async (req, res) => {
  const id = Number(req.params?.id);
  if (!id) {
    res.status(400).send("Invalid company id.");
    return;
  }
  const name = normalizeText(req.body?.name);
  const customerNumber = normalizeText(req.body?.customer_number);
  const discount = Number(req.body?.discount_percent || 0);
  const country = normalizeText(req.body?.country_code);
  const noPyramid = normalizeBoolean(req.body?.no_pyramid_import);

  await queryRun(
    `UPDATE companies SET
      name = ?,
      customer_number = ?,
      discount_percent = ?,
      country_code = ?,
      no_pyramid_import = ?,
      updated_at = datetime('now')
     WHERE id = ?`,
    [name, customerNumber, discount, country, noPyramid, id]
  );
  res.json({ ok: true });
});

app.delete("/api/admin/companies/:id", async (req, res) => {
  const id = Number(req.params?.id);
  if (!id) {
    res.status(400).send("Invalid company id.");
    return;
  }
  await queryRun("DELETE FROM companies WHERE id = ?", [id]);
  res.json({ ok: true });
});

// Admin - Delivery addresses
app.get("/api/admin/delivery-addresses", async (req, res) => {
  const companyId = req.query?.company_id ? Number(req.query.company_id) : null;
  const rows = companyId
    ? await queryAll(
      `SELECT id, company_id, attn_first_name, attn_last_name, street, street_2, zip_code, postal_area, country, delivery_id
         FROM delivery_addresses WHERE company_id = ? ORDER BY id DESC`,
      [companyId]
    )
    : await queryAll(
      `SELECT id, company_id, attn_first_name, attn_last_name, street, street_2, zip_code, postal_area, country, delivery_id
         FROM delivery_addresses ORDER BY id DESC`
    );
  res.json(rows);
});

app.post("/api/admin/delivery-addresses", async (req, res) => {
  const companyId = Number(req.body?.company_id);
  if (!companyId) {
    res.status(400).send("Company id is required.");
    return;
  }
  await queryRun(
    `INSERT INTO delivery_addresses (
      company_id, attn_first_name, attn_last_name, street, street_2,
      zip_code, postal_area, country, delivery_id, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    [
      companyId,
      normalizeText(req.body?.attn_first_name),
      normalizeText(req.body?.attn_last_name),
      normalizeText(req.body?.street),
      normalizeText(req.body?.street_2),
      normalizeText(req.body?.zip_code),
      normalizeText(req.body?.postal_area),
      normalizeText(req.body?.country),
      normalizeText(req.body?.delivery_id)
    ]
  );
  res.json({ ok: true });
});

app.put("/api/admin/delivery-addresses/:id", async (req, res) => {
  const id = Number(req.params?.id);
  if (!id) {
    res.status(400).send("Invalid address id.");
    return;
  }
  await queryRun(
    `UPDATE delivery_addresses SET
      company_id = ?,
      attn_first_name = ?,
      attn_last_name = ?,
      street = ?,
      street_2 = ?,
      zip_code = ?,
      postal_area = ?,
      country = ?,
      delivery_id = ?,
      updated_at = datetime('now')
     WHERE id = ?`,
    [
      Number(req.body?.company_id) || null,
      normalizeText(req.body?.attn_first_name),
      normalizeText(req.body?.attn_last_name),
      normalizeText(req.body?.street),
      normalizeText(req.body?.street_2),
      normalizeText(req.body?.zip_code),
      normalizeText(req.body?.postal_area),
      normalizeText(req.body?.country),
      normalizeText(req.body?.delivery_id),
      id
    ]
  );
  res.json({ ok: true });
});

app.delete("/api/admin/delivery-addresses/:id", async (req, res) => {
  const id = Number(req.params?.id);
  if (!id) {
    res.status(400).send("Invalid address id.");
    return;
  }
  await queryRun("DELETE FROM delivery_addresses WHERE id = ?", [id]);
  res.json({ ok: true });
});

app.post("/api/auth/login", async (req, res) => {
  const email = normalizeText(req.body?.email).toLowerCase();
  const password = normalizeText(req.body?.password);
  if (!email || !password) {
    res.status(400).send("Email and password are required.");
    return;
  }
  const user = await queryGet("SELECT * FROM users WHERE email = ?", [email]);
  if (!user || !verifyPassword(password, user.password_hash)) {
    res.status(401).send("Invalid credentials.");
    return;
  }
  if (user.status !== "active") {
    res.status(403).send("User is not active.");
    return;
  }
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashSessionToken(token);
  const ttlSeconds = SESSION_TTL_DAYS * 24 * 60 * 60;
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  await queryRun(
    `INSERT INTO sessions (user_id, session_hash, expires_at, created_at, last_seen_at, ip, user_agent)
     VALUES (?, ?, ?, datetime('now'), datetime('now'), ?, ?)`,
    [user.id, tokenHash, expiresAt, req.ip || "", req.headers["user-agent"] || ""]
  );
  setSessionCookie(req, res, token, ttlSeconds);
  res.json(await buildUserResponse(user));
});

app.post("/api/auth/register", async (req, res) => {
  const payload = req.body || {};
  const customer = payload.customer || {};
  const shipping = payload.shipping || {};
  const billing = payload.billing || {};

  const firstName = normalizeText(customer.first_name);
  const lastName = normalizeText(customer.last_name);
  const phone = normalizeText(customer.phone);
  const email = normalizeText(customer.email).toLowerCase();
  const companyName = normalizeText(customer.company);

  if (!firstName || !lastName || !phone || !email || !companyName) {
    res.status(400).send("Missing required customer fields.");
    return;
  }

  const existing = await queryGet("SELECT id FROM users WHERE email = ?", [email]);
  if (existing) {
    res.status(409).send("Email already exists.");
    return;
  }

  await queryRun(
    `INSERT INTO companies (name, customer_number, discount_percent, country_code, no_pyramid_import, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    [companyName, "", 0, normalizeText(billing.country) || normalizeText(shipping.country), 0]
  );
  const companyRow = await queryGet("SELECT id FROM companies WHERE name = ? ORDER BY id DESC LIMIT 1", [companyName]);
  const companyId = companyRow?.id;

  const tempPassword = randomBytes(12).toString("hex");
  await queryRun(
    `INSERT INTO users (
       email, password_hash, first_name, last_name, phone, company_id, status,
       is_order_manager, is_ce_admin,
       billing_name, billing_street, billing_street_2, billing_zip_code, billing_postal_area,
       billing_country, billing_email, billing_org_number,
       shipping_attn_first_name, shipping_attn_last_name, shipping_street, shipping_street_2,
       shipping_zip_code, shipping_postal_area, shipping_country,
       created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    [
      email,
      hashPassword(tempPassword),
      firstName,
      lastName,
      phone,
      companyId,
      normalizeText(billing.name),
      normalizeText(billing.street),
      normalizeText(billing.street_2),
      normalizeText(billing.zip_code),
      normalizeText(billing.postal_area),
      normalizeText(billing.country),
      normalizeText(billing.email),
      normalizeText(billing.org_number),
      normalizeText(shipping.attn_first_name),
      normalizeText(shipping.attn_last_name),
      normalizeText(shipping.street),
      normalizeText(shipping.street_2),
      normalizeText(shipping.zip_code),
      normalizeText(shipping.postal_area),
      normalizeText(shipping.country)
    ]
  );

  res.json({ ok: true });
});

app.post("/api/auth/logout", async (req, res) => {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE];
  if (token) {
    const tokenHash = hashSessionToken(token);
    await queryRun("DELETE FROM sessions WHERE session_hash = ?", [tokenHash]);
  }
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.get("/api/auth/me", async (req, res) => {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    res.status(401).send("Not authenticated.");
    return;
  }
  res.json(await buildUserResponse(user));
});

app.put("/api/user", async (req, res) => {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    res.status(401).send("Not authenticated.");
    return;
  }
  const payload = req.body || {};
  const updates = {
    first_name: normalizeText(payload.first_name),
    last_name: normalizeText(payload.last_name),
    phone: normalizeText(payload.phone),
    selected_delivery_address_id: payload.selected_delivery_address_id || null,
    billing_name: normalizeText(payload.billing?.name),
    billing_street: normalizeText(payload.billing?.street),
    billing_street_2: normalizeText(payload.billing?.street_2),
    billing_zip_code: normalizeText(payload.billing?.zip_code),
    billing_postal_area: normalizeText(payload.billing?.postal_area),
    billing_country: normalizeText(payload.billing?.country),
    billing_email: normalizeText(payload.billing?.email),
    billing_org_number: normalizeText(payload.billing?.org_number),
    shipping_attn_first_name: normalizeText(payload.shipping?.attn_first_name),
    shipping_attn_last_name: normalizeText(payload.shipping?.attn_last_name),
    shipping_street: normalizeText(payload.shipping?.street),
    shipping_street_2: normalizeText(payload.shipping?.street_2),
    shipping_zip_code: normalizeText(payload.shipping?.zip_code),
    shipping_postal_area: normalizeText(payload.shipping?.postal_area),
    shipping_country: normalizeText(payload.shipping?.country)
  };
  await queryRun(
    `UPDATE users SET
      first_name = ?,
      last_name = ?,
      phone = ?,
      selected_delivery_address_id = ?,
      billing_name = ?,
      billing_street = ?,
      billing_street_2 = ?,
      billing_zip_code = ?,
      billing_postal_area = ?,
      billing_country = ?,
      billing_email = ?,
      billing_org_number = ?,
      shipping_attn_first_name = ?,
      shipping_attn_last_name = ?,
      shipping_street = ?,
      shipping_street_2 = ?,
      shipping_zip_code = ?,
      shipping_postal_area = ?,
      shipping_country = ?,
      updated_at = datetime('now')
     WHERE id = ?`,
    [
      updates.first_name,
      updates.last_name,
      updates.phone,
      updates.selected_delivery_address_id,
      updates.billing_name,
      updates.billing_street,
      updates.billing_street_2,
      updates.billing_zip_code,
      updates.billing_postal_area,
      updates.billing_country,
      updates.billing_email,
      updates.billing_org_number,
      updates.shipping_attn_first_name,
      updates.shipping_attn_last_name,
      updates.shipping_street,
      updates.shipping_street_2,
      updates.shipping_zip_code,
      updates.shipping_postal_area,
      updates.shipping_country,
      user.id
    ]
  );
  const updatedUser = await queryGet("SELECT * FROM users WHERE id = ?", [user.id]);
  res.json(await buildUserResponse(updatedUser));
});

app.get("/api/delivery-addresses", async (req, res) => {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    res.status(401).send("Not authenticated.");
    return;
  }
  if (!user.company_id) {
    res.json([]);
    return;
  }
  const addresses = await queryAll(
    `SELECT id, attn_first_name, attn_last_name, street, street_2, zip_code, postal_area, country, delivery_id
     FROM delivery_addresses WHERE company_id = ? ORDER BY id ASC`,
    [user.company_id]
  );
  res.json(addresses);
});

app.get("/api/main-products", async (req, res) => {
  const items = (await getMainProducts()).map((row) => ({
    key: row.key,
    name: row.name_sv || row.name_en || row.key
  }));
  res.json(items);
});

app.get("/api/main-products/catalogs", async (req, res) => {
  const items = (await queryAll(
    "SELECT key, name_sv, name_en, catalog_image FROM categories WHERE is_main = 1 ORDER BY position ASC, id ASC"
  )).map((row) => ({
    key: row.key,
    name: row.name_sv || row.name_en || row.key,
    catalog_image: row.catalog_image || "",
    catalog_url: row.catalog_image
      ? buildPublicUrl(`/images/product-catalog-images/${row.catalog_image}`)
      : ""
  }));
  res.json(items);
});

app.post("/api/main-products/:key/catalog-image", upload.single("file"), async (req, res) => {
  const key = normalizeText(req.params?.key);
  const file = req.file;
  if (!key) {
    res.status(400).send("Main key is required.");
    return;
  }
  if (!file) {
    res.status(400).send("Image file is required.");
    return;
  }
  const category = await queryGet("SELECT key, is_main, catalog_image FROM categories WHERE key = ?", [key]);
  if (!category) {
    res.status(404).send("Category not found.");
    return;
  }
  if (!category.is_main) {
    res.status(400).send("Category is not marked as main.");
    return;
  }
  if (category.catalog_image) {
    await removeCatalogImage(category.catalog_image);
  }
  const fileName = await saveCatalogImage(file.buffer, file.originalname, key);
  res.json({
    key,
    catalog_image: fileName,
    catalog_url: fileName ? buildPublicUrl(`/images/product-catalog-images/${fileName}`) : ""
  });
});

app.delete("/api/main-products/:key/catalog-image", async (req, res) => {
  const key = normalizeText(req.params?.key);
  if (!key) {
    res.status(400).send("Main key is required.");
    return;
  }
  const category = await queryGet("SELECT key, is_main, catalog_image FROM categories WHERE key = ?", [key]);
  if (!category) {
    res.status(404).send("Category not found.");
    return;
  }
  if (!category.is_main) {
    res.status(400).send("Category is not marked as main.");
    return;
  }
  if (category.catalog_image) {
    await removeCatalogImage(category.catalog_image);
  }
  await queryRun("UPDATE categories SET catalog_image = NULL, updated_at = datetime('now') WHERE key = ?", [key]);
  res.json({ key, catalog_image: "", catalog_url: "" });
});

app.get("/api/categories", async (req, res) => {
  const query = normalizeText(req.query?.query);
  const limit = req.query?.limit;
  res.json(await listCategories({ query, limit }));
});

app.get("/api/machine-categories", async (req, res) => {
  const query = normalizeText(req.query?.query);
  const limit = req.query?.limit;
  res.json(await listMachineCategories({ query, limit }));
});

app.post("/api/machine-categories", async (req, res) => {
  const nameSv = normalizeText(req.body?.name_sv);
  const nameEn = normalizeText(req.body?.name_en);
  const rawKey = normalizeText(req.body?.key || nameSv || nameEn);
  const key = slugify(rawKey);
  if (!key) {
    res.status(400).send("Key is required.");
    return;
  }
  const existing = await queryGet("SELECT id FROM machine_categories WHERE key = ?", [key]);
  if (existing) {
    res.status(400).send("Key already exists.");
    return;
  }
  const parentId = Number(req.body?.parent_id || 0);
  const position = Number(req.body?.position || 0);
  await queryRun(
    `INSERT INTO machine_categories (key, name_sv, name_en, position, parent_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    [key, nameSv, nameEn, Number.isNaN(position) ? 0 : position, Number.isNaN(parentId) ? 0 : parentId]
  );
  res.json({ key });
});

app.post("/api/machine-categories/update", async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!items.length) {
    res.status(400).send("No machine categories provided.");
    return;
  }
  let updated = 0;
  for (const item of items) {
    const id = Number(item?.id);
    if (Number.isNaN(id) || id <= 0) {
      continue;
    }
    const position = Number(item?.position || 0);
    const parentId = Number(item?.parent_id || 0);
    await queryRun(
      `UPDATE machine_categories
       SET name_sv = ?, name_en = ?, position = ?, parent_id = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [
        normalizeText(item?.name_sv),
        normalizeText(item?.name_en),
        Number.isNaN(position) ? 0 : position,
        Number.isNaN(parentId) ? 0 : parentId,
        id
      ]
    );
    updated += 1;
  }
  res.json({ updated });
});

app.delete("/api/machine-categories/:id", async (req, res) => {
  const id = Number(req.params?.id || 0);
  if (Number.isNaN(id) || id <= 0) {
    res.status(400).send("Invalid machine category id.");
    return;
  }
  const cascadeParam = req.query?.cascade;
  const cascade = cascadeParam === undefined ? true : normalizeBoolean(cascadeParam);
  const child = await queryGet("SELECT id FROM machine_categories WHERE parent_id = ? LIMIT 1", [id]);
  const linked = await queryGet(
    "SELECT machine_category_id FROM machine_category_product_categories WHERE machine_category_id = ? LIMIT 1",
    [id]
  );
  if (!cascade && (child || linked)) {
    res.status(400).send("Machine category has children or linked product categories. Use cascade delete.");
    return;
  }

  if (cascade) {
    const childRows = await queryAll("SELECT id FROM machine_categories WHERE parent_id = ?", [id]);
    const allIds = [id, ...childRows.map((row) => row.id)];
    const placeholders = allIds.map(() => "?").join(", ");
    await queryRun(`DELETE FROM machine_category_product_categories WHERE machine_category_id IN (${placeholders})`, allIds);
    await queryRun(`DELETE FROM machine_categories WHERE id IN (${placeholders})`, allIds);
    res.json({ deleted: allIds.length });
    return;
  }

  await queryRun("DELETE FROM machine_category_product_categories WHERE machine_category_id = ?", [id]);
  await queryRun("DELETE FROM machine_categories WHERE id = ?", [id]);
  res.json({ deleted: 1 });
});

app.get("/api/image-maps", async (req, res) => {
  const mainKey = normalizeText(req.query?.mainKey);
  if (!mainKey) {
    res.json([]);
    return;
  }
  const likeKey = `${mainKey}-%`;
  const likePath = `${mainKey}%`;
  const categories = await queryAll(
    `SELECT key, path, name_sv, name_en, position, parent_key, id
     FROM categories
     WHERE key = ?
        OR parent_key = ?
        OR key LIKE ?
        OR path LIKE ?
     ORDER BY position ASC, id ASC`,
    [mainKey, mainKey, likeKey, likePath]
  );
  if (!categories.length) {
    res.json([]);
    return;
  }
  const keys = categories.map((row) => row.key);
  const placeholders = keys.map(() => "?").join(", ");
  const mapRows = await queryAll(
    `SELECT category_key, html, updated_at
     FROM image_maps
     WHERE category_key IN (${placeholders})`,
    keys
  );
  const mapByKey = new Map(mapRows.map((row) => [row.category_key, row]));
  const items = await Promise.all(
    categories.map(async (row) => {
      const mapRow = mapByKey.get(row.key);
      const imageFile = await findImageForKey(row.key, row.path || "");
      return {
      key: row.key,
      name: row.name_sv || row.name_en || row.key,
      position: row.position ? String(row.position) : "0",
      parent_key: row.parent_key || "",
      has_map: imageMapHasHotspots(mapRow?.html),
      updated_at: mapRow?.updated_at || "",
      image_url: imageFile ? buildPublicUrl(`/images/spare-part-images/${imageFile}`) : ""
      };
    })
  );
  res.json(items);
});

app.get("/api/image-maps/:key", async (req, res) => {
  const key = normalizeText(req.params?.key);
  if (!key) {
    res.status(400).send("Category key is required.");
    return;
  }
  const category = await queryGet(
    "SELECT key, path, name_sv, name_en, position, parent_key FROM categories WHERE key = ?",
    [key]
  );
  if (!category) {
    res.status(404).send("Category not found.");
    return;
  }
  const mapRow = await getImageMapRow(key);
  const imageFile = await findImageForKey(key, category.path || "");
  res.json({
    key: category.key,
    name: category.name_sv || category.name_en || category.key,
    position: category.position ? String(category.position) : "0",
    parent_key: category.parent_key || "",
    image_url: imageFile ? buildPublicUrl(`/images/spare-part-images/${imageFile}`) : "",
    map: mapRow
      ? { html: mapRow.html || "", updated_at: mapRow.updated_at || "" }
      : { html: "", updated_at: "" },
    child_categories: await getChildCategoriesWithLabels(key),
    products: await getProductsForCategoryKey(key)
  });
});

app.post("/api/image-maps", async (req, res) => {
  const key = normalizeText(req.body?.key);
  if (!key) {
    res.status(400).send("Category key is required.");
    return;
  }
  const category = await queryGet("SELECT key FROM categories WHERE key = ?", [key]);
  if (!category) {
    res.status(404).send("Category not found.");
    return;
  }
  const html = normalizeText(req.body?.html);
  const updatedAt = normalizeText(req.body?.updated_at) || null;
  await upsertImageMap(key, html, updatedAt);
  res.json({ ok: true });
});

app.delete("/api/image-maps/:key", async (req, res) => {
  const key = normalizeText(req.params?.key);
  if (!key) {
    res.status(400).send("Category key is required.");
    return;
  }
  await queryRun("DELETE FROM image_maps WHERE category_key = ?", [key]);
  res.json({ deleted: 1 });
});

app.get("/wp-json/wccd/v1/get-image-map/:slug", async (req, res) => {
  const slug = normalizeText(req.params?.slug);
  if (!slug) {
    res.status(404).send("No image map found.");
    return;
  }
  const row = await getImageMapRow(slug);
  if (!row) {
    res.status(404).send("No image map found.");
    return;
  }
  res.json({
    id: row.id,
    slug: row.category_key,
    html: row.html || "",
    updated_at: row.updated_at || ""
  });
});

app.post("/wp-json/wccd/v1/update-image-map", async (req, res) => {
  const slug = normalizeText(req.body?.slug);
  const html = normalizeText(req.body?.html);
  const authcode = normalizeText(req.body?.authcode);
  if (!slug || !html) {
    res.status(400).send("Slug and html are required.");
    return;
  }
  if (authcode && authcode !== "Condesign2021!") {
    res.status(403).send("Invalid auth code.");
    return;
  }
  const updatedAt = normalizeText(req.body?.updated_at) || null;
  await upsertImageMap(slug, html, updatedAt);
  res.json({ ok: true });
});

app.post("/api/machine-categories/:id/product-categories", async (req, res) => {
  const id = Number(req.params?.id || 0);
  const categoryKey = normalizeText(req.body?.categoryKey);
  const position = Number(req.body?.position || 0);
  if (Number.isNaN(id) || id <= 0) {
    res.status(400).send("Invalid machine category id.");
    return;
  }
  if (!categoryKey) {
    res.status(400).send("Category key is required.");
    return;
  }
  const category = await queryGet("SELECT key FROM categories WHERE key = ?", [categoryKey]);
  if (!category) {
    res.status(400).send("Category not found.");
    return;
  }
  await queryRun(
    `INSERT INTO machine_category_product_categories (machine_category_id, category_key, position)
     VALUES (?, ?, ?)
     ON CONFLICT(machine_category_id, category_key) DO UPDATE SET position = excluded.position`,
    [id, categoryKey, Number.isNaN(position) ? 0 : position]
  );
  res.json({ ok: true });
});

app.delete("/api/machine-categories/:id/product-categories/:categoryKey", async (req, res) => {
  const id = Number(req.params?.id || 0);
  const categoryKey = normalizeText(req.params?.categoryKey);
  if (Number.isNaN(id) || id <= 0) {
    res.status(400).send("Invalid machine category id.");
    return;
  }
  if (!categoryKey) {
    res.status(400).send("Category key is required.");
    return;
  }
  await queryRun(
    "DELETE FROM machine_category_product_categories WHERE machine_category_id = ? AND category_key = ?",
    [id, categoryKey]
  );
  res.json({ ok: true });
});

app.post("/api/categories", async (req, res) => {
  const pathValue = normalizeText(req.body?.path);
  if (!pathValue) {
    res.status(400).send("Category path is required.");
    return;
  }
  const key = createKeyFromPath(pathValue);
  if (!key) {
    res.status(400).send("Category key is required.");
    return;
  }
  const existing = await queryGet("SELECT key FROM categories WHERE key = ?", [key]);
  if (existing) {
    res.status(400).send("Category key already exists.");
    return;
  }
  const parentKey = resolveParentKey(pathValue);
  const position = Number(req.body?.position || 0);
  const isMain = normalizeBoolean(req.body?.is_main);
  await queryRun(
    `INSERT INTO categories (key, path, name_sv, desc_sv, name_en, desc_en, position, parent_key, is_main, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    [
      key,
      pathValue,
      normalizeText(req.body?.name_sv),
      normalizeText(req.body?.desc_sv),
      normalizeText(req.body?.name_en),
      normalizeText(req.body?.desc_en),
      Number.isNaN(position) ? 0 : position,
      parentKey,
      isMain
    ]
  );
  res.json({ key });
});

app.post("/api/categories/update", async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!items.length) {
    res.status(400).send("No category items provided.");
    return;
  }
  let updated = 0;
  for (const item of items) {
    const key = normalizeText(item?.key);
    if (!key) continue;
    const position = Number(item?.position || 0);
    await queryRun(
      `UPDATE categories
       SET name_sv = ?, desc_sv = ?, name_en = ?, desc_en = ?, position = ?, is_main = ?, updated_at = datetime('now')
       WHERE key = ?`,
      [
        normalizeText(item?.name_sv),
        normalizeText(item?.desc_sv),
        normalizeText(item?.name_en),
        normalizeText(item?.desc_en),
        Number.isNaN(position) ? 0 : position,
        normalizeBoolean(item?.is_main),
        key
      ]
    );
    updated += 1;
  }
  res.json({ updated });
});

app.delete("/api/categories/:key", async (req, res) => {
  const key = normalizeText(req.params?.key);
  if (!key) {
    res.status(400).send("Category key is required.");
    return;
  }
  const cascade = normalizeBoolean(req.query?.cascade);
  if (!cascade) {
    const child = await queryGet("SELECT key FROM categories WHERE parent_key = ? LIMIT 1", [key]);
    const linked = await queryGet("SELECT category_key FROM product_categories WHERE category_key = ? LIMIT 1", [key]);
    if (child || linked) {
      res.status(400).send("Category has children or products. Use cascade delete.");
      return;
    }
    await queryRun("DELETE FROM categories WHERE key = ?", [key]);
    res.json({ deleted: 1 });
    return;
  }
  const likePattern = `${key}-%`;
  const targets = await queryAll("SELECT key FROM categories WHERE key = ? OR key LIKE ?", [key, likePattern]);
  const keys = targets.map((row) => row.key);
  if (!keys.length) {
    res.json({ deleted: 0 });
    return;
  }
  const placeholders = keys.map(() => "?").join(", ");
  await queryRun(`DELETE FROM product_categories WHERE category_key IN (${placeholders})`, keys);
  await queryRun(`DELETE FROM categories WHERE key IN (${placeholders})`, keys);
  res.json({ deleted: keys.length });
});

app.get("/api/products", async (req, res) => {
  const query = normalizeText(req.query?.query);
  const limit = req.query?.limit;
  res.json(await listProducts({ query, limit }));
});

app.post("/api/products", async (req, res) => {
  const sku = normalizeText(req.body?.sku);
  if (!sku) {
    res.status(400).send("SKU is required.");
    return;
  }
  const existing = await queryGet("SELECT sku FROM products WHERE sku = ?", [sku]);
  if (existing) {
    res.status(400).send("SKU already exists.");
    return;
  }
  const position = Number(req.body?.pos_num || 0);
  await queryRun(
    `INSERT INTO products (sku, name_sv, desc_sv, name_en, desc_en, price, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    [
      sku,
      normalizeText(req.body?.name_sv),
      normalizeText(req.body?.desc_sv),
      normalizeText(req.body?.name_en),
      normalizeText(req.body?.desc_en),
      normalizeText(req.body?.price)
    ]
  );
  res.json({ sku });
});

app.post("/api/products/update", async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!items.length) {
    res.status(400).send("No product items provided.");
    return;
  }
  let updated = 0;
  for (const item of items) {
    const sku = normalizeText(item?.sku);
    if (!sku) continue;
    await queryRun(
      `UPDATE products
       SET name_sv = ?, desc_sv = ?, name_en = ?, desc_en = ?, price = ?, updated_at = datetime('now')
       WHERE sku = ?`,
      [
        normalizeText(item?.name_sv),
        normalizeText(item?.desc_sv),
        normalizeText(item?.name_en),
        normalizeText(item?.desc_en),
        normalizeText(item?.price),
        sku
      ]
    );
    updated += 1;
  }
  res.json({ updated });
});

app.delete("/api/products/:sku", async (req, res) => {
  const sku = normalizeText(req.params?.sku);
  if (!sku) {
    res.status(400).send("SKU is required.");
    return;
  }
  await queryRun("DELETE FROM product_categories WHERE product_sku = ?", [sku]);
  await queryRun("DELETE FROM products WHERE sku = ?", [sku]);
  res.json({ deleted: 1 });
});

app.post("/api/products/:sku/categories", async (req, res) => {
  const sku = normalizeText(req.params?.sku);
  const categoryKey = normalizeText(req.body?.categoryKey);
  if (!sku || !categoryKey) {
    res.status(400).send("SKU and category key are required.");
    return;
  }
  const category = await queryGet("SELECT key FROM categories WHERE key = ?", [categoryKey]);
  if (!category) {
    res.status(400).send("Category not found.");
    return;
  }
  await insertProductCategory(sku, categoryKey, 0, 1);
  res.json({ ok: true });
});

app.delete("/api/products/:sku/categories/:categoryKey", async (req, res) => {
  const sku = normalizeText(req.params?.sku);
  const categoryKey = normalizeText(req.params?.categoryKey);
  if (!sku || !categoryKey) {
    res.status(400).send("SKU and category key are required.");
    return;
  }
  await queryRun("DELETE FROM product_categories WHERE product_sku = ? AND category_key = ?", [sku, categoryKey]);
  res.json({ ok: true });
});

app.get("/api/settings/price-currency", async (req, res) => {
  res.json(await getPriceCurrencySettings());
});

app.post("/api/settings/price-currency", async (req, res) => {
  const normalized = buildPriceCurrencySettings(req.body || {});
  if (normalized.error) {
    res.status(400).send(normalized.error);
    return;
  }
  await setSetting("price_currency", normalized);
  res.json(normalized);
});

app.get("/api/language/categories", async (req, res) => {
  const query = normalizeText(req.query?.query);
  const limit = Number(req.query?.limit || 200);
  const safeLimit = Number.isNaN(limit) ? 200 : Math.min(Math.max(limit, 1), 500);
  const term = `%${query}%`;
  const items = await queryAll(
    `SELECT id, key, path, name_sv, desc_sv, name_en, desc_en, name_pl, desc_pl
     FROM categories
     WHERE ? = '' OR key LIKE ? OR path LIKE ? OR name_sv LIKE ? OR name_en LIKE ? OR desc_sv LIKE ? OR desc_en LIKE ?
     ORDER BY id ASC
     LIMIT ?`,
    [query, term, term, term, term, term, term, safeLimit]
  );
  res.json(items);
});

app.get("/api/language/products", async (req, res) => {
  const query = normalizeText(req.query?.query);
  const limit = Number(req.query?.limit || 200);
  const safeLimit = Number.isNaN(limit) ? 200 : Math.min(Math.max(limit, 1), 500);
  const term = `%${query}%`;
  const items = await queryAll(
    `SELECT sku, name_sv, desc_sv, name_en, desc_en, name_pl, desc_pl
     FROM products
     WHERE ? = '' OR sku LIKE ? OR name_sv LIKE ? OR name_en LIKE ? OR desc_sv LIKE ? OR desc_en LIKE ?
     ORDER BY sku ASC
     LIMIT ?`,
    [query, term, term, term, term, term, safeLimit]
  );
  res.json(items);
});

app.post("/api/language/update", async (req, res) => {
  const type = normalizeText(req.body?.type).toLowerCase();
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!items.length) {
    res.status(400).send("No language items provided.");
    return;
  }

  let updated = 0;
  if (type === "category") {
    for (const item of items) {
      if (!item?.id) continue;
      await queryRun(
        "UPDATE categories SET name_sv = ?, desc_sv = ?, name_en = ?, desc_en = ?, name_pl = ?, desc_pl = ?, updated_at = datetime('now') WHERE id = ?",
        [
          normalizeText(item.name_sv),
          normalizeText(item.desc_sv),
          normalizeText(item.name_en),
          normalizeText(item.desc_en),
          normalizeText(item.name_pl),
          normalizeText(item.desc_pl),
          item.id
        ]
      );
      updated += 1;
    }
  } else if (type === "product") {
    for (const item of items) {
      const sku = normalizeText(item.sku);
      if (!sku) continue;
      await queryRun(
        "UPDATE products SET name_sv = ?, desc_sv = ?, name_en = ?, desc_en = ?, name_pl = ?, desc_pl = ?, updated_at = datetime('now') WHERE sku = ?",
        [
          normalizeText(item.name_sv),
          normalizeText(item.desc_sv),
          normalizeText(item.name_en),
          normalizeText(item.desc_en),
          normalizeText(item.name_pl),
          normalizeText(item.desc_pl),
          sku
        ]
      );
      updated += 1;
    }
  } else {
    res.status(400).send("Unknown language type.");
    return;
  }

  res.json({ updated });
});

app.post(
  "/api/import/products",
  upload.fields([
    { name: "csv", maxCount: 1 },
    { name: "zip", maxCount: 1 },
    { name: "catalog", maxCount: 1 }
  ]),
  async (req, res) => {
    const csvFile = req.files?.csv?.[0];
    if (!csvFile) {
      res.status(400).send("CSV file is required.");
      return;
    }

    const dryRun = normalizeBoolean(
      req.body?.dryRun ?? req.body?.dry_run ?? req.query?.dryRun ?? req.query?.dry_run
    );
    const records = parseCsv(csvFile.buffer);
    const validation = validateProductImport(records);
    const zipFile = req.files?.zip?.[0];
    const zipValidation = zipFile ? validateZipImages(zipFile.buffer) : null;

    if (!validation.ok) {
      res.status(400).json({
        ok: false,
        dryRun: Boolean(dryRun),
        validation,
        zipValidation
      });
      return;
    }

    const mainKeys = Array.from(
      new Set(
        records
          .filter((row) => normalizeText(row.type).toLowerCase() === "produkt")
          .map((row) => createKeyFromPath(normalizeText(row.category_path)))
          .filter(Boolean)
      )
    );

    const skusToReplace = Array.from(
      new Set(
        records
          .filter((row) => normalizeText(row.type).toLowerCase() === "artikel")
          .map((row) => normalizeText(row.artikel_id))
          .filter(Boolean)
      )
    );

    if (dryRun) {
      res.json({
        ok: true,
        dryRun: true,
        validation,
        zipValidation,
        mainKeys,
        actions: {
          resetLinksForProducts: skusToReplace.length
        }
      });
      return;
    }

    if (skusToReplace.length) {
      const skuPlaceholders = skusToReplace.map(() => "?").join(", ");
      await queryRun(`DELETE FROM product_categories WHERE product_sku IN (${skuPlaceholders})`, skusToReplace);
    }

    const importedMainKeys = new Set();
    let categoryCreated = 0;
    let categoryUpdated = 0;
    let productCreated = 0;
    let productUpdated = 0;
    let productLinksReset = skusToReplace.length;

    for (const row of records) {
      const type = normalizeText(row.type).toLowerCase();
      const pathValue = normalizeText(row.category_path);
      const key = createKeyFromPath(pathValue);
      if (!key) {
        continue;
      }

      if (type === "produkt") {
        const existing = await queryGet("SELECT key FROM categories WHERE key = ?", [key]);
        const nameSv = normalizeText(row.name_sv);
        const descSv = normalizeText(row.desc_sv);
        const nameEn = normalizeText(row.name_en);
        const descEn = normalizeText(row.desc_en);
        const position = Number(row.number || 0);
        await upsertCategory(
          key,
          pathValue,
          nameSv,
          descSv,
          nameEn,
          descEn,
          null, // name_pl
          null, // desc_pl
          Number.isNaN(position) ? 0 : position,
          "",
          1,
          null
        );
        if (existing) {
          categoryUpdated += 1;
        } else {
          categoryCreated += 1;
        }
        importedMainKeys.add(key);
        continue;
      }

      if (type === "kategori") {
        const existing = await queryGet("SELECT key FROM categories WHERE key = ?", [key]);
        const nameSv = normalizeText(row.name_sv);
        const descSv = normalizeText(row.desc_sv);
        const nameEn = normalizeText(row.name_en);
        const descEn = normalizeText(row.desc_en);
        const position = Number(row.number || 0);
        const parentKey = resolveParentKey(pathValue);
        await upsertCategory(
          key,
          pathValue,
          nameSv,
          descSv,
          nameEn,
          descEn,
          null, // name_pl
          null, // desc_pl
          Number.isNaN(position) ? 0 : position,
          parentKey,
          0,
          null
        );
        if (existing) {
          categoryUpdated += 1;
        } else {
          categoryCreated += 1;
        }
        continue;
      }

      if (type === "artikel") {
        const sku = normalizeText(row.artikel_id);
        if (!sku) {
          continue;
        }
        const existing = await queryGet("SELECT sku FROM products WHERE sku = ?", [sku]);
        const nameSv = normalizeText(row.name_sv);
        const descSv = normalizeText(row.desc_sv);
        const nameEn = normalizeText(row.name_en);
        const descEn = normalizeText(row.desc_en);
        const position = Number(row.number || 0);
        const noUnits = normalizeText(row.no_units);
        await upsertProduct(
          sku,
          nameSv,
          descSv,
          nameEn,
          descEn,
          null, // name_pl
          null, // desc_pl
          null  // price (preserved by COALESCE if null)
        );
        await insertProductCategory(sku, key, position, noUnits || 1);
        if (existing) {
          productUpdated += 1;
        } else {
          productCreated += 1;
        }
      }
    }

    let imageCount = 0;
    if (zipFile) {
      imageCount = await importZip(zipFile.buffer);
    }

    const catalogFile = req.files?.catalog?.[0];
    if (catalogFile && importedMainKeys.size > 0) {
      const firstKey = Array.from(importedMainKeys)[0];
      await saveCatalogImage(catalogFile.buffer, catalogFile.originalname, firstKey);
    }

    const categoryCount = (await queryGet("SELECT COUNT(*) AS count FROM categories")).count || 0;
    const productCount = (await queryGet("SELECT COUNT(*) AS count FROM products")).count || 0;

    res.json({
      ok: true,
      dryRun: false,
      validation,
      zipValidation,
      categories: categoryCount,
      products: productCount,
      images: imageCount,
      mainKeys: Array.from(importedMainKeys),
      created: {
        categories: categoryCreated,
        products: productCreated
      },
      updated: {
        categories: categoryUpdated,
        products: productUpdated
      },
      resetLinksForProducts: productLinksReset
    });
  }
);

app.post("/api/import/pricelist", upload.single("csv"), async (req, res) => {
  const csvFile = req.file;
  if (!csvFile) {
    res.status(400).send("CSV file is required.");
    return;
  }
  const records = parse(csvFile.buffer, {
    columns: (header) => header.map(normalizeHeader),
    delimiter: ";",
    skip_empty_lines: true,
    bom: true,
    relax_quotes: true,
    relax_column_count: true
  });

  let updated = 0;
  let missing = 0;

  for (const row of records) {
    const sku = normalizeText(row.artikelkod);
    if (!sku) {
      continue;
    }
    let price = normalizeText(row.grundpris);
    if (price) {
      price = price.replace(",", ".");
    }
    const existing = await queryGet("SELECT sku FROM products WHERE sku = ?", [sku]);
    if (!existing) {
      missing += 1;
      continue;
    }
    await queryRun("UPDATE products SET price = ?, updated_at = datetime('now') WHERE sku = ?", [price, sku]);
    updated += 1;
  }

  res.json({ updated, missing });
});

app.post("/api/generate-json", async (req, res) => {
  const { mainKey, skipGlobal, onlyGlobal } = req.body || {};

  const files = [];
  const manifestEntries = [];

  if (!onlyGlobal) {
    const mainItems = mainKey ? [{ key: normalizeText(mainKey) }] : await getMainProducts();
    if (!mainItems.length) {
      res.status(400).send("No main products found.");
      return;
    }

    for (const item of mainItems) {
      const generated = await generateJsonForMainKey(item.key);
      files.push(...generated);
      generated.forEach((filePath) => {
        manifestEntries.push({ file: basename(filePath), scope: item.key });
      });
    }
  }

  if (!skipGlobal || onlyGlobal) {
    const machinePath = await generateMachineCategoriesJson();
    const pricePath = await generatePriceSettingsJson();
    files.push(machinePath);
    files.push(pricePath);
    manifestEntries.push({ file: basename(machinePath), scope: "global" });
    manifestEntries.push({ file: basename(pricePath), scope: "global" });
  }

  const contractPath = await writeContractManifest(jsonDir, manifestEntries);
  res.json({
    outputDir: jsonDir,
    files,
    contractVersion: JSON_CONTRACT_VERSION,
    contractPath
  });
});

registerCeRoutes(app);

app.listen(port, () => {
  console.log(`Manager API listening on http://localhost:${port}`);
});
