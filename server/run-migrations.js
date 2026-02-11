import "dotenv/config";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { runMigrations } from "./migrations.js";

const dbPath = process.env.MANAGER_DB_PATH || resolve("data", "manager.sqlite");
const schemaPath = process.env.MANAGER_SCHEMA_PATH || resolve("db", "schema.sql");

async function main() {
  const db = new DatabaseSync(dbPath);
  if (existsSync(schemaPath)) {
    db.exec(readFileSync(schemaPath, "utf8"));
  }
  db.exec("PRAGMA busy_timeout = 5000;");
  await runMigrations(db);
  db.close();
  console.log("Migrations complete.");
}

try {
  await main();
} catch (error) {
  console.error(error?.message || error);
  process.exitCode = 1;
}
