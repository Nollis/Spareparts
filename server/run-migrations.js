import "dotenv/config";
import { initDb, isPostgres } from "./db.js";

async function main() {
  await initDb();
  console.log(isPostgres() ? "Postgres schema/migrations complete." : "SQLite migrations complete.");
}

try {
  await main();
} catch (error) {
  console.error(error?.message || error);
  process.exitCode = 1;
}
