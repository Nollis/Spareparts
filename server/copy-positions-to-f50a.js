/**
 * Copy positions from DFP5X categories to F50-A categories
 * 
 * Since F50-A and DFP5X share the same Honda GXR-120 engine parts,
 * we can copy pos_num values from dfp5x-* to matching f50-a-* categories.
 */
import "dotenv/config";
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";

const dbPath = process.env.MANAGER_DB_PATH || "F:\\Manager\\data\\manager.sqlite";
const db = new DatabaseSync(dbPath);

// For each f50-a category, find matching dfp5x category and copy positions
// Category pattern mapping: f50-a-{suffix} -> dfp5x-{suffix}

const f50aCategories = db.prepare(`
  SELECT DISTINCT category_key 
  FROM product_categories 
  WHERE category_key LIKE 'f50-a-%'
`).all();

console.log(`Found ${f50aCategories.length} F50-A categories`);

let updated = 0;
let skipped = 0;

db.exec("BEGIN");

f50aCategories.forEach(({ category_key }) => {
    // Extract suffix: f50-a-engine-honda-gxr-120-engine-parts -> engine-honda-gxr-120-engine-parts
    const suffix = category_key.replace(/^f50-a-/, '');
    const dfp5xKey = `dfp5x-${suffix}`;

    console.log(`\nProcessing: ${category_key}`);
    console.log(`  Looking for: ${dfp5xKey}`);

    // Get products with positions from dfp5x category
    const dfp5xProducts = db.prepare(`
    SELECT product_sku, pos_num, no_units 
    FROM product_categories 
    WHERE category_key = ?
  `).all(dfp5xKey);

    if (!dfp5xProducts.length) {
        console.log(`  No matching DFP5X category found`);
        skipped++;
        return;
    }

    console.log(`  Found ${dfp5xProducts.length} products in DFP5X`);

    // Update F50-A products with matching positions
    const updateStmt = db.prepare(`
    UPDATE product_categories 
    SET pos_num = ?, no_units = ?
    WHERE product_sku = ? AND category_key = ?
  `);

    dfp5xProducts.forEach(({ product_sku, pos_num, no_units }) => {
        try {
            const result = updateStmt.run(pos_num, no_units, product_sku, category_key);
            if (result.changes > 0) {
                updated++;
            }
        } catch (err) {
            // Product might not be in f50-a category
        }
    });
});

db.exec("COMMIT");

console.log("\n--- Summary ---");
console.log(`Updated: ${updated} product-category positions`);
console.log(`Skipped categories: ${skipped}`);

// Verify specific category
console.log("\n--- Verification: f50-a-engine-honda-gxr-120-engine-parts ---");
const verification = db.prepare(`
  SELECT p.sku, p.name_sv, pc.pos_num, pc.no_units
  FROM products p
  JOIN product_categories pc ON p.sku = pc.product_sku
  WHERE pc.category_key = 'f50-a-engine-honda-gxr-120-engine-parts'
  ORDER BY pc.pos_num
`).all();

verification.forEach(row => {
    console.log(`  Pos ${row.pos_num}: ${row.sku} - ${row.name_sv}`);
});
