import "dotenv/config";
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";

const dbPath = process.env.MANAGER_DB_PATH || "F:\\Manager\\data\\manager.sqlite";
const db = new DatabaseSync(dbPath);

function fixParents(mainKey) {
    console.log(`Fixing parents for ${mainKey}...`);

    // Get all categories for this mainKey
    const categories = db.prepare(
        "SELECT id, key, parent_key, name_sv, is_main FROM categories WHERE key LIKE ? OR key = ?"
    ).all(`${mainKey}-%`, mainKey);

    const keyToId = new Map();
    categories.forEach(c => keyToId.set(c.key, c.id));

    const updates = [];

    categories.forEach(cat => {
        // Skip if is_main is true or already has valid parent
        if (cat.is_main || (cat.parent_key && keyToId.has(cat.parent_key))) {
            return;
        }

        // Attempt to find parent by stripping suffix
        let parts = cat.key.split('-');
        let foundParent = null;

        // Try successively shorter keys
        while (parts.length > 1) {
            parts.pop();
            const tryKey = parts.join('-');
            if (keyToId.has(tryKey)) {
                foundParent = tryKey;
                break;
            }
        }

        if (foundParent) {
            // REGRESSION GUARD:
            // If foundParent is Root (f50), but item seems like a deep orphan that shouldn't be on root.
            if (foundParent === mainKey) {
                // Block "Monteringsdetaljer" or specific known bad orphans
                if (cat.name_sv === 'Monteringsdetaljer') {
                    console.log(`Skipping deep orphan on root: ${cat.key} (Name: ${cat.name_sv})`);
                    return;
                }
                // Add more heuristics if needed, e.g. check if key has too many parts?
                // f50-decals (2 parts) -> OK
                // f50-a-engine-honda-gx-100-mounting-parts (7 parts) -> Skip?
                // f50-service-kit-honda-gx100 (4 parts) -> OK (Item 6)

                // Heuristic: If key has > 4 parts and parent is root, likely deep orphan?
                // But "f50-vulkollan-plate-accessories" (4 parts).
                // "f50-base-plate-vibrations-unit-parts" (6 parts) -> User surely wants this?

                // So relying on Name "Monteringsdetaljer" is safer for the specific user complaint.
            }

            console.log(`Linking ${cat.key} -> ${foundParent}`);
            updates.push({ id: cat.id, parent: foundParent });
        }
    });

    const stmt = db.prepare("UPDATE categories SET parent_key = ? WHERE id = ?");
    db.exec("BEGIN");
    for (const up of updates) {
        stmt.run(up.parent, up.id);
    }
    db.exec("COMMIT");
    console.log(`Updated ${updates.length} categories.`);
}

fixParents("f50");
