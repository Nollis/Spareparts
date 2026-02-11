export const id = "0003_polish_support";

function ensureColumn(db, table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.length) return;
  if (!columns.some((col) => col.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  }
}

export function up(db) {
  ensureColumn(db, "products", "name_pl", "name_pl TEXT");
  ensureColumn(db, "products", "desc_pl", "desc_pl TEXT");
  ensureColumn(db, "categories", "name_pl", "name_pl TEXT");
  ensureColumn(db, "categories", "desc_pl", "desc_pl TEXT");
}

export default { id, up };
