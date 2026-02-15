import "dotenv/config";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import pg from "pg";

const { Client } = pg;

const args = process.argv.slice(2);

function getArgValue(name, fallback = "") {
  const idx = args.indexOf(name);
  if (idx === -1) return fallback;
  return args[idx + 1] || fallback;
}

function hasArg(name) {
  return args.includes(name);
}

function quoteIdent(value) {
  return `"${String(value).replace(/"/g, "\"\"")}"`;
}

function toPgValue(value, pgType) {
  if (value === undefined) return null;
  if (value === null) return null;
  if (typeof value === "string" && value.trim() === "") {
    if (
      pgType.includes("timestamp") ||
      pgType.includes("date") ||
      pgType.includes("time") ||
      pgType === "integer" ||
      pgType === "bigint" ||
      pgType === "smallint" ||
      pgType === "numeric" ||
      pgType === "real" ||
      pgType === "double precision"
    ) {
      return null;
    }
  }
  return value;
}

const sqlitePath =
  getArgValue("--sqlite") ||
  process.env.MIGRATE_SQLITE_PATH ||
  process.env.MANAGER_DB_PATH ||
  resolve("data", "manager.sqlite");

const rawConnectionString = (process.env.DATABASE_URL || "").trim();
const truncateFirst = !hasArg("--no-truncate");
const chunkSize = Number(getArgValue("--chunk-size", "200")) || 200;

if (!rawConnectionString) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

if (!existsSync(sqlitePath)) {
  console.error(`SQLite file not found: ${sqlitePath}`);
  process.exit(1);
}

const preferredOrder = [
  "settings",
  "companies",
  "users",
  "delivery_addresses",
  "sessions",
  "categories",
  "products",
  "product_categories",
  "machine_categories",
  "machine_category_product_categories",
  "image_maps",
  "cart_orders",
  "ce_models",
  "ce_products",
  "schema_versions"
];

async function main() {
  const sqlite = new DatabaseSync(sqlitePath);
  const needsSsl = rawConnectionString.includes("sslmode=require");
  const connectionString = rawConnectionString
    .replace(/([?&])sslmode=[^&]*/g, "$1")
    .replace(/\?&/, "?")
    .replace(/[?&]$/, "");
  const client = new Client({
    connectionString,
    ssl: needsSsl ? { rejectUnauthorized: false } : false
  });

  await client.connect();

  try {
    const sqliteTables = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all()
      .map((r) => r.name);

    const pgTablesRes = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'"
    );
    const pgTables = new Set(pgTablesRes.rows.map((r) => r.table_name));

    const transferable = sqliteTables.filter((name) => pgTables.has(name));
    const ordered = [
      ...preferredOrder.filter((t) => transferable.includes(t)),
      ...transferable.filter((t) => !preferredOrder.includes(t))
    ];

    if (!ordered.length) {
      console.log("No matching tables between SQLite source and Postgres target.");
      return;
    }

    console.log(`SQLite source: ${sqlitePath}`);
    console.log(`Tables to migrate: ${ordered.join(", ")}`);
    console.log(`Mode: ${truncateFirst ? "truncate-and-load" : "append/upsert-safe"}`);

    await client.query("BEGIN");

    if (truncateFirst) {
      const truncateList = ordered.map((t) => quoteIdent(t)).join(", ");
      await client.query(`TRUNCATE TABLE ${truncateList} RESTART IDENTITY CASCADE`);
    }

    for (const table of ordered) {
      const pgColsRes = await client.query(
        `SELECT column_name, data_type
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1
         ORDER BY ordinal_position`,
        [table]
      );
      const pgCols = pgColsRes.rows;
      const pgTypeByCol = new Map(pgCols.map((c) => [c.column_name, c.data_type]));

      const sqliteCols = sqlite
        .prepare(`PRAGMA table_info(${quoteIdent(table)})`)
        .all()
        .map((r) => r.name);

      const columns = sqliteCols.filter((c) => pgTypeByCol.has(c));
      if (!columns.length) {
        console.log(`- ${table}: skipped (no common columns)`);
        continue;
      }

      const sqlSelect = `SELECT ${columns.map(quoteIdent).join(", ")} FROM ${quoteIdent(table)}`;
      const rows = sqlite.prepare(sqlSelect).all();
      if (!rows.length) {
        console.log(`- ${table}: 0 rows`);
        continue;
      }

      const colSql = columns.map(quoteIdent).join(", ");
      let inserted = 0;

      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        const values = [];
        const groups = chunk.map((row, rowIdx) => {
          const placeholders = columns.map((col, colIdx) => {
            const pgType = pgTypeByCol.get(col) || "";
            values.push(toPgValue(row[col], pgType));
            return `$${rowIdx * columns.length + colIdx + 1}`;
          });
          return `(${placeholders.join(", ")})`;
        });

        const insertSql = `INSERT INTO ${quoteIdent(table)} (${colSql}) VALUES ${groups.join(", ")} ON CONFLICT DO NOTHING`;
        const res = await client.query(insertSql, values);
        inserted += res.rowCount || 0;
      }

      if (columns.includes("id")) {
        await client.query(
          `SELECT setval(
             pg_get_serial_sequence('${quoteIdent(table)}', 'id'),
             COALESCE((SELECT MAX(id) FROM ${quoteIdent(table)}), 0) + 1,
             false
           )`
        );
      }

      console.log(`- ${table}: ${inserted}/${rows.length} rows inserted`);
    }

    await client.query("COMMIT");
    console.log("Migration completed successfully.");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Migration failed:", error.message || error);
    process.exitCode = 1;
  } finally {
    await client.end();
    sqlite.close();
  }
}

main();
