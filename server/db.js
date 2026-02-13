/**
 * Database abstraction layer.
 * Uses PostgreSQL when DATABASE_URL is set, otherwise SQLite.
 */
import "dotenv/config";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runMigrations } from "./migrations.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");
const usePostgres = Boolean(process.env.DATABASE_URL?.trim());

let pool = null;
let sqliteDb = null;
let sqliteCtor = null;

async function getSqliteCtor() {
  if (!sqliteCtor) {
    const sqliteModule = await import("node:sqlite");
    sqliteCtor = sqliteModule.DatabaseSync;
  }
  return sqliteCtor;
}

/**
 * Convert SQLite-style placeholders (?) to PostgreSQL ($1, $2, ...)
 * and datetime('now') to NOW()
 */
function toPgSql(sql) {
  let i = 0;
  let out = sql
    .replace(/INSERT OR IGNORE INTO product_categories\s*\([^)]+\)\s*VALUES\s*\(\?, \?, \?, \?\)/i, (m) =>
      m.replace("INSERT OR IGNORE INTO", "INSERT INTO") +
      " ON CONFLICT (product_sku, category_key, pos_num) DO NOTHING"
    )
    .replace(/\?/g, () => `$${++i}`)
    .replace(/datetime\('now'\)/gi, "NOW()");
  return out;
}

export async function initDb() {
  if (usePostgres) {
    const { default: pg } = await import("pg");
    const url = process.env.DATABASE_URL;
    const strictVerify = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === "true";
    const needsSsl = url?.includes("sslmode=require");
    const cleanUrl = url?.replace(/([?&])sslmode=[^&]*/g, "$1").replace(/\?&/, "?").replace(/[?&]$/, "") || url;
    pool = new pg.Pool({
      connectionString: cleanUrl,
      ssl: needsSsl ? { rejectUnauthorized: strictVerify } : false
    });
    const schemaPath = resolve(rootDir, "db", "schema-postgres.sql");
    if (existsSync(schemaPath)) {
      const schema = readFileSync(schemaPath, "utf8");
      await pool.query(schema);
    }
    await ensureMigrationsMarkedApplied();
    return;
  }

  const dbPath = process.env.MANAGER_DB_PATH || resolve(rootDir, "data", "manager.sqlite");
  const schemaPath = process.env.MANAGER_SCHEMA_PATH || resolve(rootDir, "db", "schema.sql");
  const DatabaseSync = await getSqliteCtor();
  sqliteDb = new DatabaseSync(dbPath);
  if (existsSync(schemaPath)) {
    const schema = readFileSync(schemaPath, "utf8");
    sqliteDb.exec(schema);
  }
  sqliteDb.exec("PRAGMA busy_timeout = 5000;");
  await runMigrations(sqliteDb);
}

async function ensureMigrationsMarkedApplied() {
  const migrationsDir = resolve(__dirname, "migrations");
  const { readdirSync } = await import("node:fs");
  const entries = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".js"))
    .map((e) => e.name.replace(".js", ""))
    .sort();
  for (const id of entries) {
    await pool.query(
      `INSERT INTO schema_versions (version) VALUES ($1) ON CONFLICT (version) DO NOTHING`,
      [id]
    );
  }
}

export function isPostgres() {
  return usePostgres;
}

export async function queryAll(sql, params = []) {
  if (pool) {
    const pgSql = toPgSql(sql);
    const result = await pool.query(pgSql, params);
    return result.rows;
  }
  return sqliteDb.prepare(sql).all(...params);
}

export async function queryGet(sql, params = []) {
  if (pool) {
    const pgSql = toPgSql(sql);
    const result = await pool.query(pgSql, params);
    return result.rows[0] ?? null;
  }
  return sqliteDb.prepare(sql).get(...params) ?? null;
}

export async function queryRun(sql, params = []) {
  if (pool) {
    const pgSql = toPgSql(sql);
    const result = await pool.query(pgSql, params);
    return {
      changes: result.rowCount ?? 0,
      lastInsertRowid: result.rows[0]?.id
    };
  }
  const r = sqliteDb.prepare(sql).run(...params);
  return {
    changes: r.changes,
    lastInsertRowid: r.lastInsertRowid
  };
}

/**
 * For batch operations that need a prepared statement (SQLite) or repeated queries (Postgres).
 * Usage: await runBatch(sql, items, (stmt, item) => stmt.run(...item));
 * For Postgres, we execute the query for each item.
 */
export function getDb() {
  if (sqliteDb) return sqliteDb;
  return null;
}

export function getPool() {
  return pool;
}
