import "dotenv/config";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __dirname = dirname(fileURLToPath(import.meta.url));

const args = new Set(process.argv.slice(2));
const getArgValue = (flag) => {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] || null;
};

const defaultDb = resolve(__dirname, "..", "ce", "db", "ce.sqlite");
const defaultSchema = resolve(__dirname, "..", "ce", "db", "schema.sql");
const defaultProductsDump = resolve(__dirname, "..", "ce", "dumps", "spareparts_wccd_monteringsintyg_and_ce_data.sql");
const defaultModelsDump = resolve(__dirname, "..", "ce", "dumps", "spareparts_wccd_ce_model_data.sql");

const dbPath = getArgValue("--db") || process.env.CE_DB_PATH || defaultDb;
const schemaPath = getArgValue("--schema") || process.env.CE_SCHEMA_PATH || defaultSchema;
const productsDump = getArgValue("--products") || defaultProductsDump;
const modelsDump = getArgValue("--models") || defaultModelsDump;
const shouldReset = !args.has("--append");

const productColumns = [
  "serienummer",
  "modell",
  "motornummer",
  "tillverkningsar",
  "godkand_av",
  "maskinslag_ce",
  "maskinslag",
  "fabrikat",
  "motorfabrikat",
  "motoreffekt",
  "motorvolym",
  "uppfyller_avgaskrav",
  "certifikat_nummer",
  "rek_bransle",
  "originalmotor",
  "hyudralolja",
  "harmoniserande_standarder",
  "enligt_villkoren_i_direktiv",
  "anmalt_organ_for_direktiv",
  "uppmatt_ljudeffektniva",
  "garanterad_ljud_och_effektniva",
  "namn_och_underskrift",
  "maskin_marke",
  "is_dynapac_ce",
  "has_been_printed"
];

const modelColumns = [
  "modellNamn",
  "maskin_marke",
  "main_product_slug",
  "maskinslag_ce",
  "maskinslag",
  "fabrikat",
  "motorfabrikat",
  "motoreffekt",
  "motorvolym",
  "uppfyller_avgaskrav",
  "certifikat_nummer",
  "rek_bransle",
  "originalmotor",
  "hyudralolja",
  "harmoniserande_standarder",
  "enligt_villkoren_i_direktiv",
  "anmalt_organ_for_direktiv",
  "uppmatt_ljudeffektniva",
  "garanterad_ljud_och_effektniva",
  "namn_och_underskrift",
  "created_for_ce_search",
  "is_dynapac_ce"
];

const productFlags = new Set(["is_dynapac_ce", "has_been_printed"]);
const modelFlags = new Set(["created_for_ce_search", "is_dynapac_ce"]);

function toText(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
}

function toFlag(value) {
  if (value === true || value === "1" || value === 1) {
    return 1;
  }
  return 0;
}

function decodeEscape(ch) {
  switch (ch) {
    case "n":
      return "\n";
    case "r":
      return "\r";
    case "t":
      return "\t";
    case "0":
      return "\0";
    case "'":
      return "'";
    case "\"":
      return "\"";
    case "\\":
      return "\\";
    default:
      return ch;
  }
}

function normalizeToken(token, wasString) {
  if (wasString) {
    return token;
  }
  const trimmed = token.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed.toUpperCase() === "NULL") {
    return null;
  }
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }
  return trimmed;
}

function parseValuesSection(text) {
  const rows = [];
  let current = null;
  let token = "";
  let tokenWasString = false;
  let inString = false;
  let escape = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escape) {
        token += decodeEscape(ch);
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === "'") {
        inString = false;
      } else {
        token += ch;
      }
      continue;
    }

    if (ch === "'") {
      inString = true;
      tokenWasString = true;
      continue;
    }

    if (ch === "(") {
      current = [];
      token = "";
      tokenWasString = false;
      continue;
    }

    if (ch === "," && current) {
      current.push(normalizeToken(token, tokenWasString));
      token = "";
      tokenWasString = false;
      continue;
    }

    if (ch === ")" && current) {
      current.push(normalizeToken(token, tokenWasString));
      rows.push(current);
      current = null;
      token = "";
      tokenWasString = false;
      continue;
    }

    if (current) {
      token += ch;
    }
  }

  return rows;
}

function extractInsertStatements(sqlText) {
  return sqlText.match(/INSERT INTO[\s\S]*?;\s*/gi) || [];
}

function parseInsertStatement(statement) {
  const match = statement.match(/INSERT INTO\s+`?[^`]+`?\s*\(([^)]+)\)\s*VALUES\s*/i);
  if (!match) {
    return null;
  }
  const columns = match[1]
    .split(",")
    .map((item) => item.replace(/`/g, "").trim())
    .filter(Boolean);
  const valuesText = statement.slice(match.index + match[0].length).trim().replace(/;$/, "");
  const rows = parseValuesSection(valuesText);
  return { columns, rows };
}

function loadRowsFromDump(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`Missing file: ${filePath}`);
  }
  const sqlText = readFileSync(filePath, "utf8");
  const statements = extractInsertStatements(sqlText);
  const rows = [];
  let columns = null;
  statements.forEach((statement) => {
    const parsed = parseInsertStatement(statement);
    if (!parsed) {
      return;
    }
    columns = parsed.columns;
    parsed.rows.forEach((row) => rows.push(row));
  });
  if (!columns) {
    throw new Error(`No INSERT statements found in ${filePath}`);
  }
  return { columns, rows };
}

function mapRow(columns, row) {
  const data = {};
  columns.forEach((col, idx) => {
    data[col] = row[idx];
  });
  return data;
}

function openDatabase() {
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA foreign_keys = ON;");
  if (existsSync(schemaPath)) {
    db.exec(readFileSync(schemaPath, "utf8"));
  }
  return db;
}

function importProducts(db) {
  const { columns, rows } = loadRowsFromDump(productsDump);
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO ce_products (${productColumns.join(", ")}) VALUES (${productColumns
      .map(() => "?")
      .join(", ")})`
  );
  let count = 0;
  rows.forEach((row) => {
    const data = mapRow(columns, row);
    const values = productColumns.map((col) => {
      const value = data[col];
      if (productFlags.has(col)) {
        return toFlag(value);
      }
      if (col === "serienummer") {
        return toText(value).trim();
      }
      return toText(value);
    });
    stmt.run(...values);
    count += 1;
  });
  return count;
}

function importModels(db) {
  const { columns, rows } = loadRowsFromDump(modelsDump);
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO ce_models (${modelColumns.join(", ")}) VALUES (${modelColumns
      .map(() => "?")
      .join(", ")})`
  );
  let count = 0;
  rows.forEach((row) => {
    const data = mapRow(columns, row);
    const values = modelColumns.map((col) => {
      const value = data[col];
      if (modelFlags.has(col)) {
        return toFlag(value);
      }
      if (col === "modellNamn") {
        return toText(value).trim();
      }
      return toText(value);
    });
    stmt.run(...values);
    count += 1;
  });
  return count;
}

function main() {
  console.log(`Using database: ${dbPath}`);
  console.log(`Products dump: ${productsDump}`);
  console.log(`Models dump: ${modelsDump}`);

  const db = openDatabase();
  try {
    db.exec("BEGIN");
    if (shouldReset) {
      db.exec("DELETE FROM ce_products;");
      db.exec("DELETE FROM ce_models;");
    }
    const modelCount = importModels(db);
    const productCount = importProducts(db);
    db.exec("COMMIT");
    console.log(`Imported ${modelCount} models and ${productCount} products.`);
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  } finally {
    db.close();
  }
}

try {
  main();
} catch (error) {
  console.error(error.message || error);
  process.exitCode = 1;
}
