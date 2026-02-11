import "dotenv/config";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const args = new Set(process.argv.slice(2));
const getArgValue = (flag) => {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] || null;
};

const defaultJsonPath = resolve(
  "F:\\Spareparts\\wp-content\\plugins\\wccd-api\\includes\\api\\v1\\cached-json-results\\machine-categories.json"
);
const jsonPath = getArgValue("--file") || process.env.MACHINE_CATEGORIES_JSON || defaultJsonPath;
const append = args.has("--append");

const dbPath = process.env.MANAGER_DB_PATH || resolve("data", "manager.sqlite");
const schemaPath = process.env.MANAGER_SCHEMA_PATH || resolve("db", "schema.sql");

function migrateMachineCategorySchema(database) {
  try {
    const columns = database.prepare("PRAGMA table_info(machine_categories)").all();
    if (!columns.length) {
      return;
    }
    const hasSlug = columns.some((col) => col.name === "slug");
    const hasKey = columns.some((col) => col.name === "key");
    if (hasSlug && !hasKey) {
      database.exec("ALTER TABLE machine_categories RENAME COLUMN slug TO key");
    }
  } catch (error) {
    console.warn("Machine category migration skipped:", error.message || error);
  }
}

function ensureDb() {
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA foreign_keys = ON;");
  if (existsSync(schemaPath)) {
    db.exec(readFileSync(schemaPath, "utf8"));
  }
  migrateMachineCategorySchema(db);
  try {
    const columns = db.prepare("PRAGMA table_info(machine_category_product_categories)").all();
    if (columns.length && !columns.some((col) => col.name === "show_for_lang")) {
      db.exec("ALTER TABLE machine_category_product_categories ADD COLUMN show_for_lang TEXT");
    }
  } catch (error) {
    console.warn("Machine category link migration skipped:", error.message || error);
  }
  return db;
}

function toText(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim();
}

function toInt(value) {
  const num = Number(value);
  if (Number.isNaN(num)) {
    return 0;
  }
  return Math.trunc(num);
}

function resolveKey(item) {
  return toText(item?.key || item?.slug).toLowerCase();
}

function resolveName(item, lang) {
  const langMap = item?.lang_name || {};
  if (lang === "se" && langMap.se) return toText(langMap.se);
  if (lang === "en" && langMap.en) return toText(langMap.en);
  return toText(item?.name);
}

function normalizeShowForLang(value) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => toText(entry).toLowerCase())
      .filter((entry) => entry && entry !== "");
  }
  if (typeof value === "string") {
    const trimmed = toText(value);
    if (!trimmed) return [];
    return trimmed
      .split(",")
      .map((entry) => toText(entry).toLowerCase())
      .filter((entry) => entry && entry !== "");
  }
  return [];
}

function parseJson(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`Missing file: ${filePath}`);
  }
  const raw = readFileSync(filePath, "utf8");
  const data = JSON.parse(raw);
  if (!Array.isArray(data)) {
    throw new Error("Machine categories JSON must be an array.");
  }
  return data;
}

function importMachineCategories(db, items) {
  const getExisting = db.prepare("SELECT id FROM machine_categories WHERE key = ?");
  const insert = db.prepare(
    `INSERT INTO machine_categories (key, name_sv, name_en, position, parent_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
  );
  const update = db.prepare(
    `UPDATE machine_categories
     SET name_sv = ?, name_en = ?, position = ?, parent_id = ?, updated_at = datetime('now')
     WHERE id = ?`
  );
  const clearLinks = db.prepare("DELETE FROM machine_category_product_categories WHERE machine_category_id = ?");
  const insertLink = db.prepare(
    `INSERT OR REPLACE INTO machine_category_product_categories
      (machine_category_id, category_key, position, show_for_lang)
     VALUES (?, ?, ?, ?)`
  );

  let created = 0;
  let updated = 0;
  let links = 0;

  const ensureCategory = (item, parentId = 0) => {
    const key = resolveKey(item);
    if (!key) {
      return 0;
    }
    const nameSv = resolveName(item, "se");
    const nameEn = resolveName(item, "en");
    const position = toInt(item?.menu_order || item?.position || 0);
    const existing = getExisting.get(key);
    if (existing?.id) {
      update.run(nameSv, nameEn, position, parentId, existing.id);
      updated += 1;
      return existing.id;
    }
    const result = insert.run(key, nameSv, nameEn, position, parentId);
    created += 1;
    return Number(result.lastInsertRowid);
  };

  const importLinks = (machineCategoryId, productCategories) => {
    if (!machineCategoryId) return;
    clearLinks.run(machineCategoryId);
    if (!Array.isArray(productCategories)) return;
    productCategories.forEach((entry) => {
      const key = resolveKey(entry);
      if (!key) {
        return;
      }
      const position = toInt(entry?.position || 0);
      const showForLang = normalizeShowForLang(entry?.showForLang);
      insertLink.run(machineCategoryId, key, position, JSON.stringify(showForLang));
      links += 1;
    });
  };

  items.forEach((item) => {
    const parentId = ensureCategory(item, 0);
    importLinks(parentId, item.product_categories);
    const children = Array.isArray(item.children) ? item.children : [];
    children.forEach((child) => {
      const childId = ensureCategory(child, parentId);
      importLinks(childId, child.product_categories);
    });
  });

  return { created, updated, links };
}

function main() {
  console.log(`Using database: ${dbPath}`);
  console.log(`Machine categories JSON: ${jsonPath}`);

  const data = parseJson(jsonPath);
  const db = ensureDb();

  try {
    db.exec("BEGIN");
    if (!append) {
      db.exec("DELETE FROM machine_category_product_categories;");
      db.exec("DELETE FROM machine_categories;");
    }
    const result = importMachineCategories(db, data);
    db.exec("COMMIT");
    console.log(`Imported machine categories: ${result.created} created, ${result.updated} updated.`);
    console.log(`Linked product categories: ${result.links}`);
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  } finally {
    db.close();
  }
}

try {
  main();
} catch (error) {
  console.error(error.message || error);
  process.exitCode = 1;
}
