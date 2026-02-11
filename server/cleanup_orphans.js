import "dotenv/config";
import { DatabaseSync } from "node:sqlite";

const dbPath = process.env.MANAGER_DB_PATH || "F:\\Manager\\data\\manager.sqlite";
const db = new DatabaseSync(dbPath);

console.log("Hiding specific orphans for F50...");

const orphansToHide = [
    'f50-a-engine-honda-gx-100-mounting-parts'
];

const stmt = db.prepare("UPDATE categories SET parent_key='' WHERE key=?");

for (const key of orphansToHide) {
    const info = db.prepare("SELECT parent_key FROM categories WHERE key=?").get(key);
    if (info) {
        console.log(`Hiding ${key} (Current Parent: ${info.parent_key})`);
        stmt.run(key);
    } else {
        console.log(`Key not found: ${key}`);
    }
}
console.log("Cleanup done.");
