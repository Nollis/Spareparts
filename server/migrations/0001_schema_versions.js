export const id = "0001_schema_versions";

export function up(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_versions (
    version TEXT PRIMARY KEY,
    applied_at TEXT DEFAULT (datetime('now'))
  )`);
}

export default { id, up };
