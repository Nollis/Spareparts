export const id = "0004_machine_categories";

function ensureColumn(db, table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.length) return;
  if (!columns.some((col) => col.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  }
}

export function up(db) {
  const columns = db.prepare("PRAGMA table_info(machine_categories)").all();
  if (columns.length) {
    const hasSlug = columns.some((col) => col.name === "slug");
    const hasKey = columns.some((col) => col.name === "key");
    if (hasSlug && !hasKey) {
      db.exec("ALTER TABLE machine_categories RENAME COLUMN slug TO key");
    }
  }

  ensureColumn(
    db,
    "machine_category_product_categories",
    "show_for_lang",
    "show_for_lang TEXT"
  );
}

export default { id, up };
