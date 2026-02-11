/**
 * Import product positions from WP export
 * 
 * Reads product_positions.csv and updates the product_categories table
 * with pos_num and no_units values.
 */
import "dotenv/config";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const dbPath = process.env.MANAGER_DB_PATH || "F:\\Manager\\data\\manager.sqlite";
const db = new DatabaseSync(dbPath);

const csvPath = resolve("F:\\Manager\\product_positions.csv");
const csvContent = readFileSync(csvPath, "utf-8");

// Parse CSV (semicolon-delimited, double-quoted values)
const lines = csvContent.split(/\r?\n/).filter(line => line.trim());
const header = lines[0];

console.log("Header:", header);
console.log(`Total rows: ${lines.length - 1}`);

// Prepare update statement
const updateStmt = db.prepare(`
    UPDATE product_categories 
    SET pos_num = ?, no_units = ?
    WHERE product_sku = ? AND category_key = ?
`);

// Prepare insert statement for missing links
const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO product_categories (product_sku, category_key, pos_num, no_units)
    VALUES (?, ?, ?, ?)
`);

// Check if link exists
const checkStmt = db.prepare(`
    SELECT 1 FROM product_categories WHERE product_sku = ? AND category_key = ?
`);

let updated = 0;
let inserted = 0;
let skipped = 0;
let errors = 0;

db.exec("BEGIN");

for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    // Parse CSV line: "sku";"category_key";"pos_num";"no_units"
    const parts = line.split(";").map(p => p.replace(/^"|"$/g, "").trim());

    if (parts.length < 4) {
        console.log(`Skipping malformed line ${i}: ${line}`);
        skipped++;
        continue;
    }

    const [sku, category_key, pos_num_str, no_units_str] = parts;
    const pos_num = parseInt(pos_num_str, 10) || 0;
    const no_units = parseInt(no_units_str, 10) || 1;

    // Skip placeholder SKUs
    if (sku === ">" || sku === "<" || !sku) {
        skipped++;
        continue;
    }

    try {
        // Check if link exists
        const exists = checkStmt.get(sku, category_key);

        if (exists) {
            updateStmt.run(pos_num, no_units, sku, category_key);
            updated++;
        } else {
            // Try to insert (might fail if product doesn't exist)
            insertStmt.run(sku, category_key, pos_num, no_units);
            inserted++;
        }
    } catch (err) {
        errors++;
        if (errors <= 10) {
            console.error(`Error on line ${i} (${sku}, ${category_key}):`, err.message);
        }
    }
}

db.exec("COMMIT");

console.log("\n--- Import Summary ---");
console.log(`Updated: ${updated}`);
console.log(`Inserted: ${inserted}`);
console.log(`Skipped: ${skipped}`);
console.log(`Errors: ${errors}`);

// Verify the F50 category we were investigating
console.log("\n--- Verification: f50-a-engine-honda-gxr-120-engine-parts ---");
const verifyResult = db.prepare(`
    SELECT p.sku, p.name_sv, pc.pos_num, pc.no_units
    FROM products p
    JOIN product_categories pc ON p.sku = pc.product_sku
    WHERE pc.category_key = 'f50-a-engine-honda-gxr-120-engine-parts'
    ORDER BY pc.pos_num
`).all();

console.log(`Products: ${verifyResult.length}`);
verifyResult.forEach(row => {
    console.log(`  Pos ${row.pos_num}: ${row.sku} - ${row.name_sv} (${row.no_units} units)`);
});
