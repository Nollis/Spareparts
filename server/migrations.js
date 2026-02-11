import { readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

function ensureSchemaVersionsTable(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_versions (
    version TEXT PRIMARY KEY,
    applied_at TEXT DEFAULT (datetime('now'))
  )`);
}

function getAppliedVersions(db) {
  const rows = db.prepare("SELECT version FROM schema_versions").all();
  return new Set(rows.map((row) => row.version));
}

async function loadMigrations(migrationsDir) {
  const entries = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
    .map((entry) => entry.name)
    .sort();

  const migrations = [];
  for (const name of entries) {
    const fileUrl = pathToFileURL(resolve(migrationsDir, name)).href;
    const module = await import(fileUrl);
    const migration = module?.default || module;
    if (!migration?.id || typeof migration.up !== "function") {
      throw new Error(`Invalid migration: ${name}`);
    }
    migrations.push(migration);
  }
  return migrations;
}

export async function runMigrations(db, options = {}) {
  const rootDir =
    options.rootDir || resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const migrationsDir =
    options.migrationsDir || resolve(rootDir, "server", "migrations");

  ensureSchemaVersionsTable(db);
  const applied = getAppliedVersions(db);
  const migrations = await loadMigrations(migrationsDir);

  for (const migration of migrations) {
    if (applied.has(migration.id)) {
      continue;
    }
    db.exec("BEGIN");
    try {
      migration.up(db);
      db.prepare("INSERT INTO schema_versions (version) VALUES (?)").run(migration.id);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw new Error(`Migration ${migration.id} failed: ${error?.message || error}`);
    }
  }
}
