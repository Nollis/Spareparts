import test from "node:test";
import assert from "node:assert/strict";

import {
  validateCategoriesJson,
  validateProductsJson,
  validatePriceSettingsJson,
  validateMachineCategoriesJson
} from "../server/json-contract.js";

test("validateCategoriesJson accepts minimal valid payload", () => {
  const payload = [
    {
      id: 1,
      key: "f50",
      name: "Engine",
      parent: 0,
      lang_name: { se: "Engine", en: "Engine", pl: "" },
      lang_desc: { se: "", en: "", pl: "" }
    }
  ];
  const result = validateCategoriesJson(payload);
  assert.equal(result.ok, true);
});

test("validateProductsJson accepts minimal valid payload", () => {
  const payload = [
    {
      id: 10,
      sku: "SKU123",
      name: "Part A",
      lang_name: { se: "Part A", en: "Part A", pl: "" },
      lang_desc: { se: "", en: "", pl: "" },
      categories: []
    }
  ];
  const result = validateProductsJson(payload);
  assert.equal(result.ok, true);
});

test("validatePriceSettingsJson accepts minimal valid payload", () => {
  const payload = {
    baseCurrency: "SEK",
    currencies: [{ code: "SEK", name: "Swedish krona", rate: 1 }]
  };
  const result = validatePriceSettingsJson(payload);
  assert.equal(result.ok, true);
});

test("validateMachineCategoriesJson accepts minimal valid payload", () => {
  const payload = [
    {
      id: 1,
      key: "m1",
      name: "Machines",
      parent: 0,
      lang_name: { se: "Machines", en: "Machines", pl: "" },
      lang_desc: { se: "", en: "", pl: "" },
      children: [
        {
          id: 2,
          key: "m1-child",
          name: "Child",
          parent: 1,
          lang_name: { se: "Child", en: "Child", pl: "" },
          lang_desc: { se: "", en: "", pl: "" }
        }
      ]
    }
  ];
  const result = validateMachineCategoriesJson(payload);
  assert.equal(result.ok, true);
});

test("validateCategoriesJson fails on non-array", () => {
  const result = validateCategoriesJson({ ok: false });
  assert.equal(result.ok, false);
});
