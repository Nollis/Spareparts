import "dotenv/config";
import express from "express";
import multer from "multer";
import { DatabaseSync } from "node:sqlite";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import AdmZip from "adm-zip";
import { parse } from "csv-parse/sync";
import { registerCeRoutes } from "./ce-api.js";
import { runMigrations } from "./migrations.js";
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

import cors from "cors";
const app = express();
app.use(cors());

const port = Number(process.env.MANAGER_API_PORT || 8788);
const dbPath = process.env.MANAGER_DB_PATH || resolve("data", "manager.sqlite");
const schemaPath = process.env.MANAGER_SCHEMA_PATH || resolve("db", "schema.sql");
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
ensureDir(categoryImagesDir);
ensureDir(catalogImagesDir);
ensureDir(outputDir);
ensureDir(jsonDir);

async function openDatabase() {
  const db = new DatabaseSync(dbPath);
  if (existsSync(schemaPath)) {
    const schema = readFileSync(schemaPath, "utf8");
    db.exec(schema);
  }
  db.exec("PRAGMA busy_timeout = 5000;");
  await runMigrations(db);
  return db;
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

const db = await openDatabase();

function queryAll(sql, params = []) {
  return db.prepare(sql).all(...params);
}

function queryGet(sql, params = []) {
  return db.prepare(sql).get(...params);
}

function queryRun(sql, params = []) {
  return db.prepare(sql).run(...params);
}

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

function getSetting(key, fallbackValue = null) {
  const row = queryGet("SELECT value FROM settings WHERE key = ?", [key]);
  if (!row || !row.value) {
    return fallbackValue;
  }
  try {
    return JSON.parse(row.value);
  } catch (error) {
    return fallbackValue;
  }
}

function setSetting(key, value) {
  const payload = JSON.stringify(value ?? null);
  queryRun(
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

function cleanupExpiredSessions() {
  queryRun("DELETE FROM sessions WHERE expires_at <= datetime('now')");
}

function buildUserResponse(userRow) {
  if (!userRow) return null;
  const company = userRow.company_id
    ? queryGet(
      "SELECT id, name, customer_number, discount_percent, country_code, no_pyramid_import FROM companies WHERE id = ?",
      [userRow.company_id]
    )
    : null;
  const deliveryAddresses = company
    ? queryAll(
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

function getAuthenticatedUser(req) {
  cleanupExpiredSessions();
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE];
  if (!token) return null;
  const tokenHash = hashSessionToken(token);
  const session = queryGet(
    `SELECT s.id, s.user_id, s.expires_at, u.*
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.session_hash = ?`,
    [tokenHash]
  );
  if (!session) return null;
  const isExpired = queryGet("SELECT datetime('now') >= ? AS expired", [session.expires_at])?.expired;
  if (isExpired) {
    queryRun("DELETE FROM sessions WHERE id = ?", [session.id]);
    return null;
  }
  queryRun("UPDATE sessions SET last_seen_at = datetime('now') WHERE id = ?", [session.id]);
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

function getPriceCurrencySettings() {
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


const upsertCategory = db.prepare(`
  INSERT INTO categories (key, path, name_sv, desc_sv, name_en, desc_en, name_pl, desc_pl, position, parent_key, is_main, catalog_image, updated_at)
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
    updated_at = datetime('now')
`);

const upsertProduct = db.prepare(`
  INSERT INTO products (sku, name_sv, desc_sv, name_en, desc_en, name_pl, desc_pl, price, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  ON CONFLICT(sku) DO UPDATE SET
    name_sv = excluded.name_sv,
    desc_sv = excluded.desc_sv,
    name_en = excluded.name_en,
    desc_en = excluded.desc_en,
    name_pl = COALESCE(excluded.name_pl, products.name_pl),
    desc_pl = COALESCE(excluded.desc_pl, products.desc_pl),
    price = COALESCE(excluded.price, products.price),
    updated_at = datetime('now')
`);

const insertProductCategory = db.prepare(
  "INSERT OR IGNORE INTO product_categories (product_sku, category_key, pos_num, no_units) VALUES (?, ?, ?, ?)"
);

function importZip(buffer) {
  const zip = new AdmZip(buffer);
  let count = 0;
  zip.getEntries().forEach((entry) => {
    if (entry.isDirectory) {
      return;
    }
    const ext = extname(entry.entryName).toLowerCase();
    if (!ext) {
      return;
    }
    const base = sanitizeFileName(basename(entry.entryName, ext));
    if (!base) {
      return;
    }
    const outputName = `${base}${ext}`;
    const outputPath = resolve(categoryImagesDir, outputName);
    writeFileSync(outputPath, entry.getData());
    count += 1;
  });
  return count;
}

function saveCatalogImage(buffer, originalName, mainKey) {
  if (!mainKey) {
    return "";
  }
  const ext = extname(originalName).toLowerCase() || ".jpg";
  const fileName = `product_catalog_image-${mainKey}${ext}`;
  const outputPath = resolve(catalogImagesDir, fileName);
  writeFileSync(outputPath, buffer);
  queryRun("UPDATE categories SET catalog_image = ?, updated_at = datetime('now') WHERE key = ?", [
    fileName,
    mainKey
  ]);
  return fileName;
}

function removeCatalogImage(fileName) {
  if (!fileName) {
    return;
  }
  const safeName = basename(fileName);
  const filePath = resolve(catalogImagesDir, safeName);
  if (existsSync(filePath)) {
    rmSync(filePath, { force: true });
  }
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

function removeCategoryImagesByBases(baseNames) {
  if (!baseNames || baseNames.size === 0) {
    return 0;
  }
  if (!existsSync(categoryImagesDir)) {
    return 0;
  }
  let removed = 0;
  const files = readdirSync(categoryImagesDir, { withFileTypes: true });
  files.forEach((entry) => {
    if (!entry.isFile()) {
      return;
    }
    const base = sanitizeFileName(basename(entry.name, extname(entry.name)));
    if (baseNames.has(base)) {
      rmSync(resolve(categoryImagesDir, entry.name), { force: true });
      removed += 1;
    }
  });
  return removed;
}

function findImageForKey(key, pathValue = "") {
  const variants = [];
  if (key) {
    variants.push(key, sanitizeFileName(key));
  }
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
      const filePath = resolve(categoryImagesDir, fileName);
      if (existsSync(filePath)) {
        return fileName;
      }
    }
  }
  return "";
}

function buildPublicUrl(relativePath) {
  if (!relativePath) {
    return "";
  }
  return relativePath.startsWith("/") ? relativePath : `/${relativePath}`;
}

function imageMapHasHotspots(html) {
  if (!html) {
    return false;
  }
  return /<area\b/i.test(html);
}

function getImageMapRow(categoryKey) {
  return queryGet(
    "SELECT id, category_key, html, updated_at FROM image_maps WHERE category_key = ?",
    [categoryKey]
  );
}

function upsertImageMap(categoryKey, html, updatedAt = null) {
  queryRun(
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

function getChildCategoriesWithLabels(parentKey) {
  const rows = queryAll(
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

function getProductsForCategoryKey(categoryKey) {
  const rows = queryAll(
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

function generateJsonForMainKey(mainKey) {
  const likePattern = `${mainKey}-%`;
  let categories = queryAll(
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

  const categoryItems = categories.map((cat) => {
    const name = cat.name_sv || cat.name_en || cat.key;
    const wpParentKey = wpParentBySlug.get(cat.key) || "";
    const parentIdFromWp = wpParentKey ? categoryIdByKey.get(wpParentKey) || 0 : 0;
    const parentId = parentIdFromWp || (cat.parent_key ? categoryIdByKey.get(cat.parent_key) || 0 : 0);
    const imageFile = findImageForKey(cat.key, cat.path);
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
  });

  const productRows = queryAll(
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

  const categoriesPath = resolve(jsonDir, `categories-${mainKey}.json`);
  const productsPath = resolve(jsonDir, `products-${mainKey}.json`);
  writeJsonValidated(categoriesPath, categoryItems, validateCategoriesJson, "categories export");
  writeJsonValidated(productsPath, productItems, validateProductsJson, "products export");
  return [categoriesPath, productsPath];
}

function generatePriceSettingsJson() {
  const settings = getPriceCurrencySettings();
  const settingsPath = resolve(jsonDir, "price-settings.json");
  writeJsonValidated(settingsPath, settings, validatePriceSettingsJson, "price settings export");
  return settingsPath;
}

function generateMachineCategoriesJson() {
  const items = getMachineCategoryHierarchy();
  const outputPath = resolve(jsonDir, "machine-categories.json");
  writeJsonValidated(outputPath, items, validateMachineCategoriesJson, "machine categories export");
  return outputPath;
}

function getMainProducts() {
  return queryAll("SELECT key, name_sv, name_en FROM categories WHERE is_main = 1 ORDER BY position ASC, id ASC");
}

function listCategories({ query = "", limit = 200 } = {}) {
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

function listProducts({ query = "", limit = 200 } = {}) {
  const term = `%${query}%`;
  const items = queryAll(
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
  const categoryRows = queryAll(
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

function getMachineCategoryLinks(machineCategoryIds) {
  if (!machineCategoryIds.length) {
    return new Map();
  }
  const placeholders = machineCategoryIds.map(() => "?").join(", ");
  const linkRows = queryAll(
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
    const categoryRows = queryAll(
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

function listMachineCategories({ query = "", limit = 200 } = {}) {
  const term = `%${query}%`;
  const rows = queryAll(
    `SELECT id, key, parent_id, position, name_sv, name_en
     FROM machine_categories
     WHERE ? = '' OR key LIKE ? OR name_sv LIKE ? OR name_en LIKE ?
     ORDER BY position ASC, id ASC
     LIMIT ?`,
    [query, term, term, term, clampLimit(limit)]
  );
  const linkMap = getMachineCategoryLinks(rows.map((row) => row.id));
  return rows.map((row) => ({
    ...row,
    product_categories: linkMap.get(row.id) || []
  }));
}

function getMachineCategoryHierarchy() {
  const rows = queryAll(
    `SELECT id, key, parent_id, position, name_sv, name_en
     FROM machine_categories
     ORDER BY position ASC, id ASC`
  );
  if (!rows.length) {
    return [];
  }
  const linkMap = getMachineCategoryLinks(rows.map((row) => row.id));
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
app.use("/files", express.static(outputDir));
app.use("/images/spare-part-images", express.static(categoryImagesDir));
app.use("/images/product-catalog-images", express.static(catalogImagesDir));
app.use("/json", express.static(jsonDir));

app.get("/api/status", (req, res) => {
  const categoryCount = queryGet("SELECT COUNT(*) AS count FROM categories").count || 0;
  const productCount = queryGet("SELECT COUNT(*) AS count FROM products").count || 0;
  const mainCount = queryGet("SELECT COUNT(*) AS count FROM categories WHERE is_main = 1").count || 0;
  res.json({ categoryCount, productCount, mainCount });
});

app.get("/api/schema-versions", (req, res) => {
  const versions = queryAll(
    "SELECT version, applied_at FROM schema_versions ORDER BY applied_at ASC"
  );
  res.json({ versions });
});

app.get("/api/search", (req, res) => {
  const query = normalizeText(req.query?.query);
  const lang = normalizeText(req.query?.lang) || "sv";
  const limit = clampLimit(req.query?.limit, 50, 200);
  if (!query) {
    res.json([]);
    return;
  }
  const term = `%${query}%`;
  const rows = queryAll(
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
app.get("/api/admin/users", (req, res) => {
  const rows = queryAll(
    `SELECT u.id, u.email, u.first_name, u.last_name, u.phone, u.status,
            u.is_order_manager, u.is_ce_admin, u.company_id,
            c.name AS company_name
     FROM users u
     LEFT JOIN companies c ON c.id = u.company_id
     ORDER BY u.id DESC`
  );
  res.json(rows);
});

app.post("/api/admin/users", (req, res) => {
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

  queryRun(
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

app.put("/api/admin/users/:id", (req, res) => {
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

  queryRun(
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
    queryRun(
      `UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`,
      [hashPassword(password), id]
    );
  }

  res.json({ ok: true });
});

app.delete("/api/admin/users/:id", (req, res) => {
  const id = Number(req.params?.id);
  if (!id) {
    res.status(400).send("Invalid user id.");
    return;
  }
  queryRun("DELETE FROM sessions WHERE user_id = ?", [id]);
  queryRun("DELETE FROM users WHERE id = ?", [id]);
  res.json({ ok: true });
});

// Admin - Companies
app.get("/api/admin/companies", (req, res) => {
  const rows = queryAll(
    `SELECT id, name, customer_number, discount_percent, country_code, no_pyramid_import
     FROM companies ORDER BY name ASC`
  );
  res.json(rows);
});

app.post("/api/admin/companies", (req, res) => {
  const name = normalizeText(req.body?.name);
  if (!name) {
    res.status(400).send("Company name is required.");
    return;
  }
  const customerNumber = normalizeText(req.body?.customer_number);
  const discount = Number(req.body?.discount_percent || 0);
  const country = normalizeText(req.body?.country_code);
  const noPyramid = normalizeBoolean(req.body?.no_pyramid_import);

  queryRun(
    `INSERT INTO companies (name, customer_number, discount_percent, country_code, no_pyramid_import, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    [name, customerNumber, discount, country, noPyramid]
  );
  res.json({ ok: true });
});

app.put("/api/admin/companies/:id", (req, res) => {
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

  queryRun(
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

app.delete("/api/admin/companies/:id", (req, res) => {
  const id = Number(req.params?.id);
  if (!id) {
    res.status(400).send("Invalid company id.");
    return;
  }
  queryRun("DELETE FROM companies WHERE id = ?", [id]);
  res.json({ ok: true });
});

// Admin - Delivery addresses
app.get("/api/admin/delivery-addresses", (req, res) => {
  const companyId = req.query?.company_id ? Number(req.query.company_id) : null;
  const rows = companyId
    ? queryAll(
      `SELECT id, company_id, attn_first_name, attn_last_name, street, street_2, zip_code, postal_area, country, delivery_id
         FROM delivery_addresses WHERE company_id = ? ORDER BY id DESC`,
      [companyId]
    )
    : queryAll(
      `SELECT id, company_id, attn_first_name, attn_last_name, street, street_2, zip_code, postal_area, country, delivery_id
         FROM delivery_addresses ORDER BY id DESC`
    );
  res.json(rows);
});

app.post("/api/admin/delivery-addresses", (req, res) => {
  const companyId = Number(req.body?.company_id);
  if (!companyId) {
    res.status(400).send("Company id is required.");
    return;
  }
  queryRun(
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

app.put("/api/admin/delivery-addresses/:id", (req, res) => {
  const id = Number(req.params?.id);
  if (!id) {
    res.status(400).send("Invalid address id.");
    return;
  }
  queryRun(
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

app.delete("/api/admin/delivery-addresses/:id", (req, res) => {
  const id = Number(req.params?.id);
  if (!id) {
    res.status(400).send("Invalid address id.");
    return;
  }
  queryRun("DELETE FROM delivery_addresses WHERE id = ?", [id]);
  res.json({ ok: true });
});

app.post("/api/auth/login", (req, res) => {
  const email = normalizeText(req.body?.email).toLowerCase();
  const password = normalizeText(req.body?.password);
  if (!email || !password) {
    res.status(400).send("Email and password are required.");
    return;
  }
  const user = queryGet("SELECT * FROM users WHERE email = ?", [email]);
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
  queryRun(
    `INSERT INTO sessions (user_id, session_hash, expires_at, created_at, last_seen_at, ip, user_agent)
     VALUES (?, ?, datetime('now', ?), datetime('now'), datetime('now'), ?, ?)`,
    [user.id, tokenHash, `+${ttlSeconds} seconds`, req.ip || "", req.headers["user-agent"] || ""]
  );
  setSessionCookie(req, res, token, ttlSeconds);
  res.json(buildUserResponse(user));
});

app.post("/api/auth/register", (req, res) => {
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

  const existing = queryGet("SELECT id FROM users WHERE email = ?", [email]);
  if (existing) {
    res.status(409).send("Email already exists.");
    return;
  }

  const companyRes = queryRun(
    `INSERT INTO companies (name, customer_number, discount_percent, country_code, no_pyramid_import, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    [companyName, "", 0, normalizeText(billing.country) || normalizeText(shipping.country), 0]
  );
  const companyId = companyRes.lastInsertRowid;

  const tempPassword = randomBytes(12).toString("hex");
  queryRun(
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

app.post("/api/auth/logout", (req, res) => {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE];
  if (token) {
    const tokenHash = hashSessionToken(token);
    queryRun("DELETE FROM sessions WHERE session_hash = ?", [tokenHash]);
  }
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.get("/api/auth/me", (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) {
    res.status(401).send("Not authenticated.");
    return;
  }
  res.json(buildUserResponse(user));
});

app.put("/api/user", (req, res) => {
  const user = getAuthenticatedUser(req);
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
  queryRun(
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
  const updatedUser = queryGet("SELECT * FROM users WHERE id = ?", [user.id]);
  res.json(buildUserResponse(updatedUser));
});

app.get("/api/delivery-addresses", (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) {
    res.status(401).send("Not authenticated.");
    return;
  }
  if (!user.company_id) {
    res.json([]);
    return;
  }
  const addresses = queryAll(
    `SELECT id, attn_first_name, attn_last_name, street, street_2, zip_code, postal_area, country, delivery_id
     FROM delivery_addresses WHERE company_id = ? ORDER BY id ASC`,
    [user.company_id]
  );
  res.json(addresses);
});

app.get("/api/main-products", (req, res) => {
  const items = getMainProducts().map((row) => ({
    key: row.key,
    name: row.name_sv || row.name_en || row.key
  }));
  res.json(items);
});

app.get("/api/main-products/catalogs", (req, res) => {
  const items = queryAll(
    "SELECT key, name_sv, name_en, catalog_image FROM categories WHERE is_main = 1 ORDER BY position ASC, id ASC"
  ).map((row) => ({
    key: row.key,
    name: row.name_sv || row.name_en || row.key,
    catalog_image: row.catalog_image || "",
    catalog_url: row.catalog_image
      ? buildPublicUrl(`/images/product-catalog-images/${row.catalog_image}`)
      : ""
  }));
  res.json(items);
});

app.post("/api/main-products/:key/catalog-image", upload.single("file"), (req, res) => {
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
  const category = queryGet("SELECT key, is_main, catalog_image FROM categories WHERE key = ?", [key]);
  if (!category) {
    res.status(404).send("Category not found.");
    return;
  }
  if (!category.is_main) {
    res.status(400).send("Category is not marked as main.");
    return;
  }
  if (category.catalog_image) {
    removeCatalogImage(category.catalog_image);
  }
  const fileName = saveCatalogImage(file.buffer, file.originalname, key);
  res.json({
    key,
    catalog_image: fileName,
    catalog_url: fileName ? buildPublicUrl(`/images/product-catalog-images/${fileName}`) : ""
  });
});

app.delete("/api/main-products/:key/catalog-image", (req, res) => {
  const key = normalizeText(req.params?.key);
  if (!key) {
    res.status(400).send("Main key is required.");
    return;
  }
  const category = queryGet("SELECT key, is_main, catalog_image FROM categories WHERE key = ?", [key]);
  if (!category) {
    res.status(404).send("Category not found.");
    return;
  }
  if (!category.is_main) {
    res.status(400).send("Category is not marked as main.");
    return;
  }
  if (category.catalog_image) {
    removeCatalogImage(category.catalog_image);
  }
  queryRun("UPDATE categories SET catalog_image = NULL, updated_at = datetime('now') WHERE key = ?", [key]);
  res.json({ key, catalog_image: "", catalog_url: "" });
});

app.get("/api/categories", (req, res) => {
  const query = normalizeText(req.query?.query);
  const limit = req.query?.limit;
  res.json(listCategories({ query, limit }));
});

app.get("/api/machine-categories", (req, res) => {
  const query = normalizeText(req.query?.query);
  const limit = req.query?.limit;
  res.json(listMachineCategories({ query, limit }));
});

app.post("/api/machine-categories", (req, res) => {
  const nameSv = normalizeText(req.body?.name_sv);
  const nameEn = normalizeText(req.body?.name_en);
  const rawKey = normalizeText(req.body?.key || nameSv || nameEn);
  const key = slugify(rawKey);
  if (!key) {
    res.status(400).send("Key is required.");
    return;
  }
  const existing = queryGet("SELECT id FROM machine_categories WHERE key = ?", [key]);
  if (existing) {
    res.status(400).send("Key already exists.");
    return;
  }
  const parentId = Number(req.body?.parent_id || 0);
  const position = Number(req.body?.position || 0);
  queryRun(
    `INSERT INTO machine_categories (key, name_sv, name_en, position, parent_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    [key, nameSv, nameEn, Number.isNaN(position) ? 0 : position, Number.isNaN(parentId) ? 0 : parentId]
  );
  res.json({ key });
});

app.post("/api/machine-categories/update", (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!items.length) {
    res.status(400).send("No machine categories provided.");
    return;
  }
  const stmt = db.prepare(
    `UPDATE machine_categories
     SET name_sv = ?, name_en = ?, position = ?, parent_id = ?, updated_at = datetime('now')
     WHERE id = ?`
  );
  let updated = 0;
  items.forEach((item) => {
    const id = Number(item?.id);
    if (Number.isNaN(id) || id <= 0) {
      return;
    }
    const position = Number(item?.position || 0);
    const parentId = Number(item?.parent_id || 0);
    stmt.run(
      normalizeText(item?.name_sv),
      normalizeText(item?.name_en),
      Number.isNaN(position) ? 0 : position,
      Number.isNaN(parentId) ? 0 : parentId,
      id
    );
    updated += 1;
  });
  res.json({ updated });
});

app.delete("/api/machine-categories/:id", (req, res) => {
  const id = Number(req.params?.id || 0);
  if (Number.isNaN(id) || id <= 0) {
    res.status(400).send("Invalid machine category id.");
    return;
  }
  const cascadeParam = req.query?.cascade;
  const cascade = cascadeParam === undefined ? true : normalizeBoolean(cascadeParam);
  const child = queryGet("SELECT id FROM machine_categories WHERE parent_id = ? LIMIT 1", [id]);
  const linked = queryGet(
    "SELECT machine_category_id FROM machine_category_product_categories WHERE machine_category_id = ? LIMIT 1",
    [id]
  );
  if (!cascade && (child || linked)) {
    res.status(400).send("Machine category has children or linked product categories. Use cascade delete.");
    return;
  }

  if (cascade) {
    const childRows = queryAll("SELECT id FROM machine_categories WHERE parent_id = ?", [id]);
    const allIds = [id, ...childRows.map((row) => row.id)];
    const placeholders = allIds.map(() => "?").join(", ");
    queryRun(`DELETE FROM machine_category_product_categories WHERE machine_category_id IN (${placeholders})`, allIds);
    queryRun(`DELETE FROM machine_categories WHERE id IN (${placeholders})`, allIds);
    res.json({ deleted: allIds.length });
    return;
  }

  queryRun("DELETE FROM machine_category_product_categories WHERE machine_category_id = ?", [id]);
  queryRun("DELETE FROM machine_categories WHERE id = ?", [id]);
  res.json({ deleted: 1 });
});

app.get("/api/image-maps", (req, res) => {
  const mainKey = normalizeText(req.query?.mainKey);
  if (!mainKey) {
    res.json([]);
    return;
  }
  const likeKey = `${mainKey}-%`;
  const likePath = `${mainKey}%`;
  const categories = queryAll(
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
  const mapRows = queryAll(
    `SELECT category_key, html, updated_at
     FROM image_maps
     WHERE category_key IN (${placeholders})`,
    keys
  );
  const mapByKey = new Map(mapRows.map((row) => [row.category_key, row]));
  const items = categories.map((row) => {
    const mapRow = mapByKey.get(row.key);
    const imageFile = findImageForKey(row.key, row.path);
    return {
      key: row.key,
      name: row.name_sv || row.name_en || row.key,
      position: row.position ? String(row.position) : "0",
      parent_key: row.parent_key || "",
      has_map: imageMapHasHotspots(mapRow?.html),
      updated_at: mapRow?.updated_at || "",
      image_url: imageFile ? buildPublicUrl(`/images/spare-part-images/${imageFile}`) : ""
    };
  });
  res.json(items);
});

app.get("/api/image-maps/:key", (req, res) => {
  const key = normalizeText(req.params?.key);
  if (!key) {
    res.status(400).send("Category key is required.");
    return;
  }
  const category = queryGet(
    "SELECT key, path, name_sv, name_en, position, parent_key FROM categories WHERE key = ?",
    [key]
  );
  if (!category) {
    res.status(404).send("Category not found.");
    return;
  }
  const mapRow = getImageMapRow(key);
  const imageFile = findImageForKey(key, category.path);
  res.json({
    key: category.key,
    name: category.name_sv || category.name_en || category.key,
    position: category.position ? String(category.position) : "0",
    parent_key: category.parent_key || "",
    image_url: imageFile ? buildPublicUrl(`/images/spare-part-images/${imageFile}`) : "",
    map: mapRow
      ? { html: mapRow.html || "", updated_at: mapRow.updated_at || "" }
      : { html: "", updated_at: "" },
    child_categories: getChildCategoriesWithLabels(key),
    products: getProductsForCategoryKey(key)
  });
});

app.post("/api/image-maps", (req, res) => {
  const key = normalizeText(req.body?.key);
  if (!key) {
    res.status(400).send("Category key is required.");
    return;
  }
  const category = queryGet("SELECT key FROM categories WHERE key = ?", [key]);
  if (!category) {
    res.status(404).send("Category not found.");
    return;
  }
  const html = normalizeText(req.body?.html);
  const updatedAt = normalizeText(req.body?.updated_at) || null;
  upsertImageMap(key, html, updatedAt);
  res.json({ ok: true });
});

app.delete("/api/image-maps/:key", (req, res) => {
  const key = normalizeText(req.params?.key);
  if (!key) {
    res.status(400).send("Category key is required.");
    return;
  }
  queryRun("DELETE FROM image_maps WHERE category_key = ?", [key]);
  res.json({ deleted: 1 });
});

app.get("/wp-json/wccd/v1/get-image-map/:slug", (req, res) => {
  const slug = normalizeText(req.params?.slug);
  if (!slug) {
    res.status(404).send("No image map found.");
    return;
  }
  const row = getImageMapRow(slug);
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

app.post("/wp-json/wccd/v1/update-image-map", (req, res) => {
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
  upsertImageMap(slug, html, updatedAt);
  res.json({ ok: true });
});

app.post("/api/machine-categories/:id/product-categories", (req, res) => {
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
  const category = queryGet("SELECT key FROM categories WHERE key = ?", [categoryKey]);
  if (!category) {
    res.status(400).send("Category not found.");
    return;
  }
  queryRun(
    `INSERT INTO machine_category_product_categories (machine_category_id, category_key, position)
     VALUES (?, ?, ?)
     ON CONFLICT(machine_category_id, category_key) DO UPDATE SET position = excluded.position`,
    [id, categoryKey, Number.isNaN(position) ? 0 : position]
  );
  res.json({ ok: true });
});

app.delete("/api/machine-categories/:id/product-categories/:categoryKey", (req, res) => {
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
  queryRun(
    "DELETE FROM machine_category_product_categories WHERE machine_category_id = ? AND category_key = ?",
    [id, categoryKey]
  );
  res.json({ ok: true });
});

app.post("/api/categories", (req, res) => {
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
  const existing = queryGet("SELECT key FROM categories WHERE key = ?", [key]);
  if (existing) {
    res.status(400).send("Category key already exists.");
    return;
  }
  const parentKey = resolveParentKey(pathValue);
  const position = Number(req.body?.position || 0);
  const isMain = normalizeBoolean(req.body?.is_main);
  queryRun(
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

app.post("/api/categories/update", (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!items.length) {
    res.status(400).send("No category items provided.");
    return;
  }
  const stmt = db.prepare(
    `UPDATE categories
     SET name_sv = ?, desc_sv = ?, name_en = ?, desc_en = ?, position = ?, is_main = ?, updated_at = datetime('now')
     WHERE key = ?`
  );
  let updated = 0;
  items.forEach((item) => {
    const key = normalizeText(item?.key);
    if (!key) {
      return;
    }
    const position = Number(item?.position || 0);
    stmt.run(
      normalizeText(item?.name_sv),
      normalizeText(item?.desc_sv),
      normalizeText(item?.name_en),
      normalizeText(item?.desc_en),
      Number.isNaN(position) ? 0 : position,
      normalizeBoolean(item?.is_main),
      key
    );
    updated += 1;
  });
  res.json({ updated });
});

app.delete("/api/categories/:key", (req, res) => {
  const key = normalizeText(req.params?.key);
  if (!key) {
    res.status(400).send("Category key is required.");
    return;
  }
  const cascade = normalizeBoolean(req.query?.cascade);
  if (!cascade) {
    const child = queryGet("SELECT key FROM categories WHERE parent_key = ? LIMIT 1", [key]);
    const linked = queryGet("SELECT category_key FROM product_categories WHERE category_key = ? LIMIT 1", [key]);
    if (child || linked) {
      res.status(400).send("Category has children or products. Use cascade delete.");
      return;
    }
    queryRun("DELETE FROM categories WHERE key = ?", [key]);
    res.json({ deleted: 1 });
    return;
  }
  const likePattern = `${key}-%`;
  const targets = queryAll("SELECT key FROM categories WHERE key = ? OR key LIKE ?", [key, likePattern]);
  const keys = targets.map((row) => row.key);
  if (!keys.length) {
    res.json({ deleted: 0 });
    return;
  }
  const placeholders = keys.map(() => "?").join(", ");
  queryRun(`DELETE FROM product_categories WHERE category_key IN (${placeholders})`, keys);
  queryRun(`DELETE FROM categories WHERE key IN (${placeholders})`, keys);
  res.json({ deleted: keys.length });
});

app.get("/api/products", (req, res) => {
  const query = normalizeText(req.query?.query);
  const limit = req.query?.limit;
  res.json(listProducts({ query, limit }));
});

app.post("/api/products", (req, res) => {
  const sku = normalizeText(req.body?.sku);
  if (!sku) {
    res.status(400).send("SKU is required.");
    return;
  }
  const existing = queryGet("SELECT sku FROM products WHERE sku = ?", [sku]);
  if (existing) {
    res.status(400).send("SKU already exists.");
    return;
  }
  const position = Number(req.body?.pos_num || 0);
  queryRun(
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

app.post("/api/products/update", (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!items.length) {
    res.status(400).send("No product items provided.");
    return;
  }
  const stmt = db.prepare(
    `UPDATE products
     SET name_sv = ?, desc_sv = ?, name_en = ?, desc_en = ?, price = ?, updated_at = datetime('now')
     WHERE sku = ?`
  );
  let updated = 0;
  items.forEach((item) => {
    const sku = normalizeText(item?.sku);
    if (!sku) {
      return;
    }
    const position = Number(item?.pos_num || 0);
    stmt.run(
      normalizeText(item?.name_sv),
      normalizeText(item?.desc_sv),
      normalizeText(item?.name_en),
      normalizeText(item?.desc_en),
      normalizeText(item?.price),
      sku
    );
    updated += 1;
  });
  res.json({ updated });
});

app.delete("/api/products/:sku", (req, res) => {
  const sku = normalizeText(req.params?.sku);
  if (!sku) {
    res.status(400).send("SKU is required.");
    return;
  }
  queryRun("DELETE FROM product_categories WHERE product_sku = ?", [sku]);
  queryRun("DELETE FROM products WHERE sku = ?", [sku]);
  res.json({ deleted: 1 });
});

app.post("/api/products/:sku/categories", (req, res) => {
  const sku = normalizeText(req.params?.sku);
  const categoryKey = normalizeText(req.body?.categoryKey);
  if (!sku || !categoryKey) {
    res.status(400).send("SKU and category key are required.");
    return;
  }
  const category = queryGet("SELECT key FROM categories WHERE key = ?", [categoryKey]);
  if (!category) {
    res.status(400).send("Category not found.");
    return;
  }
  insertProductCategory.run(sku, categoryKey, 0, 1);
  res.json({ ok: true });
});

app.delete("/api/products/:sku/categories/:categoryKey", (req, res) => {
  const sku = normalizeText(req.params?.sku);
  const categoryKey = normalizeText(req.params?.categoryKey);
  if (!sku || !categoryKey) {
    res.status(400).send("SKU and category key are required.");
    return;
  }
  queryRun("DELETE FROM product_categories WHERE product_sku = ? AND category_key = ?", [sku, categoryKey]);
  res.json({ ok: true });
});

app.get("/api/settings/price-currency", (req, res) => {
  res.json(getPriceCurrencySettings());
});

app.post("/api/settings/price-currency", (req, res) => {
  const normalized = buildPriceCurrencySettings(req.body || {});
  if (normalized.error) {
    res.status(400).send(normalized.error);
    return;
  }
  setSetting("price_currency", normalized);
  res.json(normalized);
});

app.get("/api/language/categories", (req, res) => {
  const query = normalizeText(req.query?.query);
  const limit = Number(req.query?.limit || 200);
  const safeLimit = Number.isNaN(limit) ? 200 : Math.min(Math.max(limit, 1), 500);
  const term = `%${query}%`;
  const items = queryAll(
    `SELECT id, key, path, name_sv, desc_sv, name_en, desc_en, name_pl, desc_pl
     FROM categories
     WHERE ? = '' OR key LIKE ? OR path LIKE ? OR name_sv LIKE ? OR name_en LIKE ? OR desc_sv LIKE ? OR desc_en LIKE ?
     ORDER BY id ASC
     LIMIT ?`,
    [query, term, term, term, term, term, term, safeLimit]
  );
  res.json(items);
});

app.get("/api/language/products", (req, res) => {
  const query = normalizeText(req.query?.query);
  const limit = Number(req.query?.limit || 200);
  const safeLimit = Number.isNaN(limit) ? 200 : Math.min(Math.max(limit, 1), 500);
  const term = `%${query}%`;
  const items = queryAll(
    `SELECT sku, name_sv, desc_sv, name_en, desc_en, name_pl, desc_pl
     FROM products
     WHERE ? = '' OR sku LIKE ? OR name_sv LIKE ? OR name_en LIKE ? OR desc_sv LIKE ? OR desc_en LIKE ?
     ORDER BY sku ASC
     LIMIT ?`,
    [query, term, term, term, term, term, safeLimit]
  );
  res.json(items);
});

app.post("/api/language/update", (req, res) => {
  const type = normalizeText(req.body?.type).toLowerCase();
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!items.length) {
    res.status(400).send("No language items provided.");
    return;
  }

  let updated = 0;
  if (type === "category") {
    const stmt = db.prepare(
      "UPDATE categories SET name_sv = ?, desc_sv = ?, name_en = ?, desc_en = ?, name_pl = ?, desc_pl = ?, updated_at = datetime('now') WHERE id = ?"
    );
    items.forEach((item) => {
      if (!item?.id) {
        return;
      }
      stmt.run(
        normalizeText(item.name_sv),
        normalizeText(item.desc_sv),
        normalizeText(item.name_en),
        normalizeText(item.desc_en),
        normalizeText(item.name_pl),
        normalizeText(item.desc_pl),
        item.id
      );
      updated += 1;
    });
  } else if (type === "product") {
    const stmt = db.prepare(
      "UPDATE products SET name_sv = ?, desc_sv = ?, name_en = ?, desc_en = ?, name_pl = ?, desc_pl = ?, updated_at = datetime('now') WHERE sku = ?"
    );
    items.forEach((item) => {
      const sku = normalizeText(item.sku);
      if (!sku) {
        return;
      }
      stmt.run(
        normalizeText(item.name_sv),
        normalizeText(item.desc_sv),
        normalizeText(item.name_en),
        normalizeText(item.desc_en),
        normalizeText(item.name_pl),
        normalizeText(item.desc_pl),
        sku
      );
      updated += 1;
    });
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
  (req, res) => {
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
      queryRun(`DELETE FROM product_categories WHERE product_sku IN (${skuPlaceholders})`, skusToReplace);
    }

    const importedMainKeys = new Set();
    let categoryCreated = 0;
    let categoryUpdated = 0;
    let productCreated = 0;
    let productUpdated = 0;
    let productLinksReset = skusToReplace.length;

    records.forEach((row) => {
      const type = normalizeText(row.type).toLowerCase();
      const pathValue = normalizeText(row.category_path);
      const key = createKeyFromPath(pathValue);
      if (!key) {
        return;
      }

      if (type === "produkt") {
        const existing = queryGet("SELECT key FROM categories WHERE key = ?", [key]);
        const nameSv = normalizeText(row.name_sv);
        const descSv = normalizeText(row.desc_sv);
        const nameEn = normalizeText(row.name_en);
        const descEn = normalizeText(row.desc_en);
        const position = Number(row.number || 0);
        upsertCategory.run(
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
        return;
      }

      if (type === "kategori") {
        const existing = queryGet("SELECT key FROM categories WHERE key = ?", [key]);
        const nameSv = normalizeText(row.name_sv);
        const descSv = normalizeText(row.desc_sv);
        const nameEn = normalizeText(row.name_en);
        const descEn = normalizeText(row.desc_en);
        const position = Number(row.number || 0);
        const parentKey = resolveParentKey(pathValue);
        upsertCategory.run(
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
        return;
      }

      if (type === "artikel") {
        const sku = normalizeText(row.artikel_id);
        if (!sku) {
          return;
        }
        const existing = queryGet("SELECT sku FROM products WHERE sku = ?", [sku]);
        const nameSv = normalizeText(row.name_sv);
        const descSv = normalizeText(row.desc_sv);
        const nameEn = normalizeText(row.name_en);
        const descEn = normalizeText(row.desc_en);
        const position = Number(row.number || 0);
        const noUnits = normalizeText(row.no_units);
        upsertProduct.run(
          sku,
          nameSv,
          descSv,
          nameEn,
          descEn,
          null, // name_pl
          null, // desc_pl
          null  // price (preserved by COALESCE if null)
        );
        insertProductCategory.run(sku, key, position, noUnits || 1);
        if (existing) {
          productUpdated += 1;
        } else {
          productCreated += 1;
        }
      }
    });

    let imageCount = 0;
    if (zipFile) {
      imageCount = importZip(zipFile.buffer);
    }

    const catalogFile = req.files?.catalog?.[0];
    if (catalogFile && importedMainKeys.size > 0) {
      const firstKey = Array.from(importedMainKeys)[0];
      saveCatalogImage(catalogFile.buffer, catalogFile.originalname, firstKey);
    }

    const categoryCount = queryGet("SELECT COUNT(*) AS count FROM categories").count || 0;
    const productCount = queryGet("SELECT COUNT(*) AS count FROM products").count || 0;

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

app.post("/api/import/pricelist", upload.single("csv"), (req, res) => {
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

  records.forEach((row) => {
    const sku = normalizeText(row.artikelkod);
    if (!sku) {
      return;
    }
    let price = normalizeText(row.grundpris);
    if (price) {
      price = price.replace(",", ".");
    }
    const existing = queryGet("SELECT sku FROM products WHERE sku = ?", [sku]);
    if (!existing) {
      missing += 1;
      return;
    }
    queryRun("UPDATE products SET price = ?, updated_at = datetime('now') WHERE sku = ?", [price, sku]);
    updated += 1;
  });

  res.json({ updated, missing });
});

app.post("/api/generate-json", (req, res) => {
  const { mainKey, skipGlobal, onlyGlobal } = req.body || {};

  const files = [];
  const manifestEntries = [];

  if (!onlyGlobal) {
    const mainItems = mainKey ? [{ key: normalizeText(mainKey) }] : getMainProducts();
    if (!mainItems.length) {
      res.status(400).send("No main products found.");
      return;
    }

    mainItems.forEach((item) => {
      const generated = generateJsonForMainKey(item.key);
      files.push(...generated);
      generated.forEach((filePath) => {
        manifestEntries.push({ file: basename(filePath), scope: item.key });
      });
    });
  }

  if (!skipGlobal || onlyGlobal) {
    const machinePath = generateMachineCategoriesJson();
    const pricePath = generatePriceSettingsJson();
    files.push(machinePath);
    files.push(pricePath);
    manifestEntries.push({ file: basename(machinePath), scope: "global" });
    manifestEntries.push({ file: basename(pricePath), scope: "global" });
  }

  const contractPath = writeContractManifest(manifestEntries);
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
