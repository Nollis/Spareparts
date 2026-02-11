import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { parseCsv, validateProductImport } from "../server/import-validation.js";

const fixturesDir = resolve("tests", "fixtures");

test("parseCsv matches golden fixture", () => {
  const csvPath = resolve(fixturesDir, "products.csv");
  const expectedPath = resolve(fixturesDir, "products.csv.expected.json");
  const csvBuffer = readFileSync(csvPath);
  const expected = JSON.parse(readFileSync(expectedPath, "utf8"));
  const parsed = parseCsv(csvBuffer);
  assert.deepStrictEqual(parsed, expected);
});

test("validateProductImport returns expected counts", () => {
  const csvPath = resolve(fixturesDir, "products.csv");
  const csvBuffer = readFileSync(csvPath);
  const parsed = parseCsv(csvBuffer);
  const result = validateProductImport(parsed);
  assert.equal(result.ok, true);
  assert.equal(result.counts.rows, 3);
  assert.equal(result.counts.produkt, 1);
  assert.equal(result.counts.kategori, 1);
  assert.equal(result.counts.artikel, 1);
});

test("validateProductImport flags missing sku", () => {
  const records = [
    {
      type: "artikel",
      category_path: "f50\\engine\\parts",
      artikel_id: ""
    }
  ];
  const result = validateProductImport(records);
  assert.equal(result.ok, false);
  assert.equal(result.counts.missingSku, 1);
});
