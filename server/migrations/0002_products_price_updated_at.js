export const id = "0002_products_price_updated_at";

function ensureColumn(db, table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.length) return;
  if (!columns.some((col) => col.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  }
}

export function up(db) {
  ensureColumn(db, "products", "price", "price TEXT");
  ensureColumn(
    db,
    "products",
    "updated_at",
    "updated_at TEXT DEFAULT (datetime('now'))"
  );
}

export default { id, up };
