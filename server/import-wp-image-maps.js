import "dotenv/config";
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";

const dbPath = process.env.MANAGER_DB_PATH || resolve("data", "manager.sqlite");
const baseUrl =
  (process.env.WP_IMAGE_MAP_BASE || "").trim() ||
  "http://swepac.local/wp-json/wccd/v1/get-image-map/";

const concurrency = Number(process.env.WP_IMAGE_MAP_CONCURRENCY || 5);

function normalizeBase(url) {
  if (!url.endsWith("/")) {
    return `${url}/`;
  }
  return url;
}

async function fetchMap(slug, base) {
  const res = await fetch(`${base}${encodeURIComponent(slug)}`);
  if (!res.ok) {
    return null;
  }
  const data = await res.json();
  if (!data?.html) {
    return null;
  }
  if (!/<area\b/i.test(data.html)) {
    return null;
  }
  return data;
}

async function runBatch(items, handler, limit) {
  const results = [];
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = items[index++];
      results.push(await handler(current));
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

function main() {
  const db = new DatabaseSync(dbPath);
  const rows = db
    .prepare("SELECT key FROM categories WHERE key IS NOT NULL AND key != ''")
    .all();
  const slugs = rows.map((row) => row.key);
  const base = normalizeBase(baseUrl);

  const upsert = db.prepare(
    `INSERT INTO image_maps (category_key, html, updated_at)
     VALUES (?, ?, COALESCE(?, datetime('now')))
     ON CONFLICT(category_key) DO UPDATE SET
       html = excluded.html,
       updated_at = COALESCE(excluded.updated_at, datetime('now'))`
  );

  let imported = 0;
  let skipped = 0;
  let failed = 0;

  return runBatch(
    slugs,
    async (slug) => {
      try {
        const mapData = await fetchMap(slug, base);
        if (!mapData) {
          skipped += 1;
          return;
        }
        upsert.run(slug, mapData.html, mapData.updated_at || null);
        imported += 1;
      } catch {
        failed += 1;
      }
    },
    concurrency
  ).then(() => {
    db.close();
    console.log(`Image maps imported: ${imported}`);
    console.log(`Image maps skipped (missing/empty): ${skipped}`);
    console.log(`Image maps failed: ${failed}`);
  });
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
