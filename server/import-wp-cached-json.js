import "dotenv/config";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { runMigrations } from "./migrations.js";

const args = new Set(process.argv.slice(2));
const getArgValue = (flag) => {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] || null;
};
const isDryRun = args.has("--dry-run") || args.has("--dryrun");

const defaultDir = resolve(
  "F:\\Spareparts\\wp-content\\plugins\\wccd-api\\includes\\api\\v1\\cached-json-results"
);
const sourceDir = getArgValue("--dir") || process.env.WP_CACHED_JSON_DIR || defaultDir;
const onlyMainKey = getArgValue("--main") || "";

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const dbPath = process.env.MANAGER_DB_PATH || resolve(rootDir, "data", "manager.sqlite");
const schemaPath = process.env.MANAGER_SCHEMA_PATH || resolve(rootDir, "db", "schema.sql");

async function ensureDb() {
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA busy_timeout = 5000;");
  if (existsSync(schemaPath)) {
    db.exec(readFileSync(schemaPath, "utf8"));
  }
  await runMigrations(db);
  return db;
}

function normalizeText(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim();
}

function capList(list, max = 50) {
  const items = Array.isArray(list) ? list : [];
  return { total: items.length, items: items.slice(0, max) };
}

function readJson(filePath) {
  if (!existsSync(filePath)) {
    return null;
  }
  const raw = readFileSync(filePath, "utf8");
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON in ${filePath}: ${error.message || error}`);
  }
}

// Global positions map loaded from CSV
let positionsMap = null;

function loadPositionsFromCsv() {
  if (positionsMap !== null) {
    return positionsMap;
  }
  positionsMap = new Map();
  const csvPath = resolve(rootDir, "product_positions.csv");
  if (!existsSync(csvPath)) {
    console.log("No product_positions.csv found, positions will default to 0");
    return positionsMap;
  }
  const content = readFileSync(csvPath, "utf-8");
  const lines = content.split(/\r?\n/).filter(line => line.trim());
  // Skip header
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const parts = line.split(";").map(p => p.replace(/^"|"$/g, "").trim());
    if (parts.length < 4) continue;
    const [sku, category_key, pos_num_str, no_units_str] = parts;
    if (!sku || sku === ">" || sku === "<") continue;
    const key = `${sku}|${category_key}`;
    positionsMap.set(key, {
      pos_num: parseInt(pos_num_str, 10) || 0,
      no_units: parseInt(no_units_str, 10) || 1
    });
  }
  console.log(`Loaded ${positionsMap.size} position entries from CSV`);
  return positionsMap;
}

function getPositionData(sku, categoryKey) {
  const positions = loadPositionsFromCsv();
  const key = `${sku}|${categoryKey}`;
  return positions.get(key) || { pos_num: 0, no_units: 1 };
}

function getMainKeysFromDir(dir) {
  if (!existsSync(dir)) {
    throw new Error(`Missing cached JSON directory: ${dir}`);
  }
  const files = readdirSync(dir);
  const keys = files
    .filter((file) => file.startsWith("categories-") && file.endsWith(".json"))
    .map((file) => file.replace(/^categories-/, "").replace(/\.json$/, ""));
  return keys;
}

function buildCategoryMaps(categories) {
  const byId = new Map();
  const bySlug = new Map();
  categories.forEach((cat) => {
    if (cat?.id) {
      byId.set(cat.id, cat);
    }
    if (cat?.slug) {
      bySlug.set(cat.slug, cat);
    }
  });
  return { byId, bySlug };
}

function buildCategoryPath(category, byId, cache = new Map()) {
  if (!category) {
    return "";
  }
  if (cache.has(category.id)) {
    return cache.get(category.id);
  }
  const slug = normalizeText(category.slug);
  if (!slug) {
    cache.set(category.id, "");
    return "";
  }
  if (!category.parent || category.parent === 0) {
    cache.set(category.id, slug);
    return slug;
  }
  const parent = byId.get(category.parent);
  const parentPath = buildCategoryPath(parent, byId, cache);
  const path = parentPath ? `${parentPath}\\${slug}` : slug;
  cache.set(category.id, path);
  return path;
}

function validateWpPayload(mainKey, categories, products) {
  const errors = [];
  const warnings = [];
  const catList = Array.isArray(categories) ? categories : [];
  const prodList = Array.isArray(products) ? products : [];
  const catById = new Map();
  const catBySlug = new Map();
  const prodById = new Map();
  const prodBySku = new Map();
  const duplicateSlugs = new Set();
  const duplicateSkus = new Set();
  let missingProductRefs = 0;
  let missingCategoryRefs = 0;

  catList.forEach((cat, index) => {
    const rowNum = index + 1;
    if (!cat?.id) {
      warnings.push(`Category row ${rowNum}: missing id.`);
    } else {
      catById.set(cat.id, cat);
    }
    const slug = normalizeText(cat?.slug || cat?.key);
    if (!slug) {
      errors.push(`Category row ${rowNum}: missing slug/key.`);
      return;
    }
    if (catBySlug.has(slug)) {
      duplicateSlugs.add(slug);
    } else {
      catBySlug.set(slug, cat);
    }
  });

  prodList.forEach((prod, index) => {
    const rowNum = index + 1;
    if (!prod?.id) {
      warnings.push(`Product row ${rowNum}: missing id.`);
    } else {
      prodById.set(prod.id, prod);
    }
    const sku = normalizeText(prod?.sku);
    if (!sku) {
      errors.push(`Product row ${rowNum}: missing sku.`);
      return;
    }
    if (prodBySku.has(sku)) {
      duplicateSkus.add(sku);
    } else {
      prodBySku.set(sku, prod);
    }
  });

  catList.forEach((cat) => {
    const items = Array.isArray(cat?.products) ? cat.products : [];
    items.forEach((item) => {
      const productId = item?.product_id || item?.id;
      if (!productId || !prodById.has(productId)) {
        missingProductRefs += 1;
      }
    });
  });

  prodList.forEach((prod) => {
    const prodCategories = Array.isArray(prod?.categories) ? prod.categories : [];
    prodCategories.forEach((catItem) => {
      const slug = normalizeText(catItem?.slug);
      if (!slug || !catBySlug.has(slug)) {
        missingCategoryRefs += 1;
      }
    });
  });

  if (duplicateSlugs.size) {
    warnings.push(
      `Duplicate category slugs detected: ${Array.from(duplicateSlugs).slice(0, 10).join(", ")}`
    );
  }
  if (duplicateSkus.size) {
    warnings.push(
      `Duplicate product SKUs detected: ${Array.from(duplicateSkus).slice(0, 10).join(", ")}`
    );
  }

  return {
    ok: errors.length === 0,
    mainKey,
    counts: {
      categories: catList.length,
      products: prodList.length,
      missingProductRefs,
      missingCategoryRefs
    },
    errors: capList(errors),
    warnings: capList(warnings),
    duplicates: {
      slugs: capList(Array.from(duplicateSlugs)),
      skus: capList(Array.from(duplicateSkus))
    }
  };
}

function importMainKey(db, mainKey, categoryJson, productJson) {
  const categories = Array.isArray(categoryJson) ? categoryJson : [];
  const products = Array.isArray(productJson) ? productJson : [];

  const { byId } = buildCategoryMaps(categories);
  const pathCache = new Map();
  const categoryById = new Map();
  categories.forEach((cat) => {
    categoryById.set(cat.id, cat);
  });

  const productById = new Map();
  products.forEach((prod) => {
    if (prod?.id) {
      productById.set(prod.id, prod);
    }
  });
  const categoryBySlug = new Map();
  categories.forEach((cat) => {
    const s = cat.slug || cat.key;
    if (s) {
      categoryBySlug.set(s, cat);
    }
  });

  const upsertCategory = db.prepare(
    `INSERT INTO categories (key, path, name_sv, desc_sv, name_en, desc_en, position, parent_key, is_main, catalog_image, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET
       path = excluded.path,
       name_sv = excluded.name_sv,
       desc_sv = excluded.desc_sv,
       name_en = excluded.name_en,
       desc_en = excluded.desc_en,
       position = excluded.position,
       parent_key = excluded.parent_key,
       is_main = excluded.is_main,
       catalog_image = excluded.catalog_image,
       updated_at = datetime('now')`
  );

  const upsertProduct = db.prepare(
    `INSERT INTO products (sku, name_sv, desc_sv, name_en, desc_en, pos_num, no_units, price, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(sku) DO UPDATE SET
       name_sv = excluded.name_sv,
       desc_sv = excluded.desc_sv,
       name_en = excluded.name_en,
       desc_en = excluded.desc_en,
       pos_num = excluded.pos_num,
       no_units = excluded.no_units,
       price = excluded.price,
       updated_at = datetime('now')`
  );

  const insertLink = db.prepare(
    "INSERT OR IGNORE INTO product_categories (product_sku, category_key, pos_num, no_units) VALUES (?, ?, ?, ?)"
  );

  let categoryCreated = 0;
  let categoryUpdated = 0;
  let productCreated = 0;
  let productUpdated = 0;
  let linksInserted = 0;

  db.exec("BEGIN");
  try {
    categories.forEach((cat) => {
      const key = normalizeText(cat.slug || cat.key);
      if (!key) {
        return;
      }
      const existing = db.prepare("SELECT key FROM categories WHERE key = ?").get(key);
      const path = buildCategoryPath(cat, byId, pathCache);
      const parentObj = cat.parent ? byId.get(cat.parent) : null;
      let parentKey = parentObj ? normalizeText(parentObj.slug || parentObj.key || "") : "";

      // Fallback: Generic parent resolution based on slug hierarchy (PHP style)
      // Fallback: Generic parent resolution based on slug hierarchy (PHP style)
      if (!parentKey && key !== mainKey && key.includes('-')) {
        let candidate = key;
        if (candidate.includes('-')) {
          candidate = candidate.substring(0, candidate.lastIndexOf('-'));
          const candidateSlug = candidate;

          // Check in current batch or DB
          let parentExists = categoryBySlug.has(candidateSlug);
          if (!parentExists) {
            const dbParent = db.prepare("SELECT key FROM categories WHERE key = ?").get(normalizeText(candidateSlug));
            if (dbParent) parentExists = true;
          }

          if (parentExists) {
            parentKey = normalizeText(candidateSlug);
          }
        }
      }
      const nameSv = normalizeText(cat.lang_name?.se || cat.name);
      const nameEn = normalizeText(cat.lang_name?.en || cat.name);
      const descSv = normalizeText(cat.lang_desc?.se || "");
      const descEn = normalizeText(cat.lang_desc?.en || "");
      const position = Number(cat.pos_num || cat.menu_order || cat.position || 0);
      const isMain = cat.parent === 0 && key === mainKey ? 1 : 0;

      let catalogImage = null;
      if (cat.product_catalog_image_url) {
        const url = String(cat.product_catalog_image_url).trim();
        if (url) {
          catalogImage = url.split("/").pop();
          if (key === mainKey) {
            console.log(`Main category ${key} catalog image extracted: ${catalogImage}`);
          }
        }
      }

      upsertCategory.run(
        key,
        path || key,
        nameSv,
        descSv,
        nameEn,
        descEn,
        Number.isNaN(position) ? 0 : position,
        parentKey,
        isMain,
        catalogImage
      );
      if (existing) {
        categoryUpdated += 1;
      } else {
        categoryCreated += 1;
      }
    });

    products.forEach((prod) => {
      const sku = normalizeText(prod.sku);
      if (!sku) {
        return;
      }
      const existing = db.prepare("SELECT sku FROM products WHERE sku = ?").get(sku);
      const nameSv = normalizeText(prod.lang_name?.se || prod.name);
      const nameEn = normalizeText(prod.lang_name?.en || prod.name);
      const descSv = normalizeText(prod.lang_desc?.se || "");
      const descEn = normalizeText(prod.lang_desc?.en || "");
      const posNum = Number(prod.pos_num || prod.menu_order || 0);
      const noUnits = normalizeText(prod.no_units || "");
      const price = normalizeText(prod.price || prod.regular_price || "");
      upsertProduct.run(
        sku,
        nameSv,
        descSv,
        nameEn,
        descEn,
        Number.isNaN(posNum) ? 0 : posNum,
        noUnits,
        price
      );
      if (existing) {
        productUpdated += 1;
      } else {
        productCreated += 1;
      }
    });

    const categoryKeys = categories
      .map((cat) => normalizeText(cat.slug))
      .filter(Boolean);
    if (categoryKeys.length) {
      const placeholders = categoryKeys.map(() => "?").join(", ");
      db
        .prepare(`DELETE FROM product_categories WHERE category_key IN (${placeholders})`)
        .run(...categoryKeys);
    }

    categories.forEach((cat) => {
      const categoryKey = normalizeText(cat.slug);
      if (!categoryKey) {
        return;
      }
      const items = Array.isArray(cat.products) ? cat.products : [];
      if (!items.length) {
        return;
      }
      items.forEach((item) => {
        const productId = item.product_id || item.id;
        const product = productById.get(productId);
        const sku = normalizeText(product?.sku);
        if (!sku) {
          return;
        }
        const posData = getPositionData(sku, categoryKey);
        insertLink.run(sku, categoryKey, posData.pos_num, posData.no_units);
        linksInserted += 1;
      });
    });

    products.forEach((prod) => {
      const sku = normalizeText(prod.sku);
      if (!sku) {
        return;
      }
      const prodCategories = Array.isArray(prod.categories) ? prod.categories : [];
      prodCategories.forEach((catItem) => {
        const slug = normalizeText(catItem?.slug);
        if (!slug) {
          return;
        }
        if (!categoryBySlug.has(slug)) {
          // Auto-create missing category found in product data
          const name = normalizeText(catItem.name || slug);
          const parentKey = slug.startsWith(mainKey + "-") ? mainKey : "";

          upsertCategory.run(
            slug,
            slug, // path (simplified)
            name, // name_sv
            "", // desc_sv
            name, // name_en
            "", // desc_en
            0, // position
            parentKey,
            0, // is_main
            null
          );
          categoryCreated += 1;
          // Add to local map so we don't try to create it again for next product
          categoryBySlug.set(slug, { id: 0, slug, name }); // Use 0 for auto-created IDs
        }
        const posData = getPositionData(sku, slug);
        insertLink.run(sku, slug, posData.pos_num, posData.no_units);
        linksInserted += 1;
      });
    });

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return {
    categoryCreated,
    categoryUpdated,
    productCreated,
    productUpdated,
    linksInserted
  };
}

async function main() {
  console.log(`Using database: ${dbPath}`);
  console.log(`WP cached JSON dir: ${sourceDir}`);
  if (isDryRun) {
    console.log("Dry-run mode enabled: no DB writes will occur.");
  }

  const keys = onlyMainKey ? [onlyMainKey] : getMainKeysFromDir(sourceDir);
  if (!keys.length) {
    throw new Error("No cached categories JSON files found.");
  }

  const db = isDryRun ? null : await ensureDb();
  let totals = {
    categoryCreated: 0,
    categoryUpdated: 0,
    productCreated: 0,
    productUpdated: 0,
    linksInserted: 0,
    skipped: 0
  };

  keys.forEach((mainKey) => {
    const categoriesPath = resolve(sourceDir, `categories-${mainKey}.json`);
    const productsPath = resolve(sourceDir, `products-${mainKey}.json`);
    let categories = null;
    let products = null;
    try {
      categories = readJson(categoriesPath);
      products = readJson(productsPath);
    } catch (error) {
      console.warn(error.message || error);
      return;
    }
    if (!categories || !products) {
      console.warn(`Skipping ${mainKey}: missing categories or products JSON.`);
      totals.skipped += 1;
      return;
    }
    const validation = validateWpPayload(mainKey, categories, products);
    if (!validation.ok) {
      console.warn(`Validation failed for ${mainKey}. Skipping import.`);
      console.warn(JSON.stringify(validation, null, 2));
      totals.skipped += 1;
      return;
    }

    if (isDryRun) {
      console.log(`Dry-run ${mainKey}: ${validation.counts.categories} categories, ${validation.counts.products} products.`);
      if (validation.warnings.total) {
        console.log(`Warnings: ${validation.warnings.total}`);
      }
      return;
    }

    const result = importMainKey(db, mainKey, categories, products);
    totals = {
      categoryCreated: totals.categoryCreated + result.categoryCreated,
      categoryUpdated: totals.categoryUpdated + result.categoryUpdated,
      productCreated: totals.productCreated + result.productCreated,
      productUpdated: totals.productUpdated + result.productUpdated,
      linksInserted: totals.linksInserted + result.linksInserted,
      skipped: totals.skipped
    };
    console.log(
      `Imported ${mainKey}: +${result.categoryCreated} categories, +${result.productCreated} products, ${result.linksInserted} links.`
    );
  });

  if (db) db.close();
  console.log("Done.");
  if (!isDryRun) {
    console.log(
      `Categories: ${totals.categoryCreated} created, ${totals.categoryUpdated} updated.`
    );
    console.log(
      `Products: ${totals.productCreated} created, ${totals.productUpdated} updated.`
    );
    console.log(`Links inserted: ${totals.linksInserted}`);
  }
  if (totals.skipped) console.log(`Skipped: ${totals.skipped}`);
}

try {
  await main();
} catch (error) {
  console.error(error.message || error);
  process.exitCode = 1;
}
