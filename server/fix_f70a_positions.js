import "dotenv/config";
import { DatabaseSync } from "node:sqlite";

const dbPath = process.env.MANAGER_DB_PATH || "F:\\Manager\\data\\manager.sqlite";
const db = new DatabaseSync(dbPath);

const fixes = [
    { key: "f70a-labels", pos: 1 },
    { key: "f70a-engine", pos: 2 },
    { key: "f70a-chassis", pos: 3 },
    { key: "f70a-a-vibrations-unit-grease-lubricate", pos: 4 },
    { key: "f70a-b-vibrations-unit-oil-lubricate", pos: 4 },
    { key: "f70a-base-plate-with-bracket-for-wheels", pos: 5 },
    { key: "f70a-transport-wheel", pos: 6 },
    { key: "f70a-sprinkler-system", pos: 7 },
    { key: "f70a-handle", pos: 8 },
    { key: "f70a-vulkollan-plate-accessories", pos: 9 },
    { key: "f70a-service-kit", pos: 10 }
];

console.log("Applying F70A position fixes...");
const stmt = db.prepare("UPDATE categories SET position = ? WHERE key = ?");
db.exec("BEGIN");
for (const fix of fixes) {
    stmt.run(fix.pos, fix.key);
}
db.exec("COMMIT");
console.log("Done.");
