import "dotenv/config";
import { DatabaseSync } from "node:sqlite";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const dbPath = process.env.CE_DB_PATH || resolve(__dirname, "..", "ce", "db", "ce.sqlite");
const dryRun = process.argv.includes("--dry-run");

const db = new DatabaseSync(dbPath);
db.exec("PRAGMA foreign_keys = ON;");

function compareDesc(left, right) {
  if (left === right) {
    return 0;
  }
  return left > right ? -1 : 1;
}

function sortRows(rows) {
  return rows.sort((a, b) => {
    const updatedCompare = compareDesc(a.updated_at || "", b.updated_at || "");
    if (updatedCompare !== 0) return updatedCompare;
    const createdCompare = compareDesc(a.created_at || "", b.created_at || "");
    if (createdCompare !== 0) return createdCompare;
    return compareDesc(Number(a.id || 0), Number(b.id || 0));
  });
}

const groups = db
  .prepare(
    `SELECT TRIM(serienummer) AS normalized,
            COUNT(*) AS cnt,
            SUM(CASE WHEN serienummer != TRIM(serienummer) THEN 1 ELSE 0 END) AS has_spaces
     FROM ce_products
     GROUP BY normalized
     HAVING cnt > 1 OR has_spaces > 0`
  )
  .all();

let deleted = 0;
let normalized = 0;

try {
  db.exec("BEGIN");
  groups.forEach((group) => {
    const normalizedSerial = group.normalized || "";
    const rows = db
      .prepare("SELECT id, serienummer, updated_at, created_at FROM ce_products WHERE TRIM(serienummer) = ?")
      .all(normalizedSerial);

    if (!rows.length) {
      return;
    }

    const ordered = sortRows(rows);
    const keep = ordered[0];
    const toDelete = ordered.slice(1);

    if (toDelete.length > 0) {
      toDelete.forEach((row) => {
        if (!row.id) {
          return;
        }
        if (!dryRun) {
          db.prepare("DELETE FROM ce_products WHERE id = ?").run(Number(row.id));
        }
        deleted += 1;
      });
    }

    const trimmed = (keep.serienummer || "").trim();
    if (trimmed !== normalizedSerial) {
      console.warn(`Normalized mismatch for ${keep.serienummer} -> ${normalizedSerial}`);
    }

    if (keep.serienummer !== normalizedSerial && keep.id) {
      if (!dryRun) {
        db.prepare("UPDATE ce_products SET serienummer = ?, updated_at = datetime('now') WHERE id = ?").run(
          normalizedSerial,
          Number(keep.id)
        );
      }
      normalized += 1;
    }
  });

  if (dryRun) {
    db.exec("ROLLBACK");
  } else {
    db.exec("COMMIT");
  }
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
} finally {
  db.close();
}

const actionLabel = dryRun ? "Dry run" : "Cleanup";
console.log(`${actionLabel} complete.`);
console.log(`Groups processed: ${groups.length}`);
console.log(`Rows deleted: ${deleted}`);
console.log(`Rows normalized: ${normalized}`);
