import { readdirSync } from "node:fs";
import { extname } from "node:path";
import { DatabaseSync } from "node:sqlite";

const dbPath = process.env.MANAGER_DB_PATH || "F:/Manager/data/manager.sqlite";
const imagesDir =
  process.env.MANAGER_CATALOG_IMAGES_DIR || "F:/Manager/data/images/product-catalog-images";

const allowedExt = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

function normalizeKey(value) {
  return String(value || "").trim().toLowerCase();
}

function parseKeyFromFilename(file) {
  const lower = file.toLowerCase();
  if (!lower.startsWith("product_catalog_image-")) {
    return "";
  }
  const keyPart = lower.replace("product_catalog_image-", "");
  const ext = extname(keyPart);
  if (!ext || !allowedExt.has(ext)) {
    return "";
  }
  return keyPart.slice(0, -ext.length);
}

function main() {
  const files = readdirSync(imagesDir);
  const map = new Map();
  files.forEach((file) => {
    const key = parseKeyFromFilename(file);
    if (!key) {
      return;
    }
    map.set(normalizeKey(key), file);
  });

  const db = new DatabaseSync(dbPath);
  const rows = db
    .prepare("SELECT key, catalog_image FROM categories WHERE is_main = 1")
    .all();
  let updated = 0;
  rows.forEach((row) => {
    const key = normalizeKey(row.key);
    if (!key) return;
    if (row.catalog_image) return;
    const file = map.get(key);
    if (!file) return;
    db.prepare("UPDATE categories SET catalog_image = ?, updated_at = datetime('now') WHERE key = ?").run(
      file,
      row.key
    );
    updated += 1;
  });
  db.close();

  console.log(`Catalog images matched: ${updated}`);
}

try {
  main();
} catch (error) {
  console.error(error.message || error);
  process.exitCode = 1;
}
