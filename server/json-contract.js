import { resolve } from "node:path";
import { writeFileSync } from "node:fs";

export const JSON_CONTRACT_VERSION = "1.0.0";

function capList(list, max = 50) {
  const items = Array.isArray(list) ? list : [];
  return { total: items.length, items: items.slice(0, max) };
}

function isString(value) {
  return typeof value === "string";
}

function isNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function validateCategoriesJson(items) {
  const errors = [];
  if (!Array.isArray(items)) {
    errors.push("Categories payload must be an array.");
    return { ok: false, errors: capList(errors) };
  }
  items.forEach((item, index) => {
    const prefix = `categories[${index}]`;
    if (!isNumber(item?.id)) errors.push(`${prefix}.id must be a number.`);
    if (!isString(item?.key) || !item.key) errors.push(`${prefix}.key must be a non-empty string.`);
    if (!isString(item?.name)) errors.push(`${prefix}.name must be a string.`);
    if (!isNumber(item?.parent)) errors.push(`${prefix}.parent must be a number.`);
    if (typeof item?.lang_name !== "object") errors.push(`${prefix}.lang_name must be an object.`);
    if (typeof item?.lang_desc !== "object") errors.push(`${prefix}.lang_desc must be an object.`);
  });
  return { ok: errors.length === 0, errors: capList(errors) };
}

function validateProductsJson(items) {
  const errors = [];
  if (!Array.isArray(items)) {
    errors.push("Products payload must be an array.");
    return { ok: false, errors: capList(errors) };
  }
  items.forEach((item, index) => {
    const prefix = `products[${index}]`;
    if (!isNumber(item?.id)) errors.push(`${prefix}.id must be a number.`);
    if (!isString(item?.sku) || !item.sku) errors.push(`${prefix}.sku must be a non-empty string.`);
    if (!isString(item?.name)) errors.push(`${prefix}.name must be a string.`);
    if (typeof item?.lang_name !== "object") errors.push(`${prefix}.lang_name must be an object.`);
    if (typeof item?.lang_desc !== "object") errors.push(`${prefix}.lang_desc must be an object.`);
    if (!Array.isArray(item?.categories)) errors.push(`${prefix}.categories must be an array.`);
  });
  return { ok: errors.length === 0, errors: capList(errors) };
}

function validatePriceSettingsJson(payload) {
  const errors = [];
  if (typeof payload !== "object" || payload === null) {
    errors.push("Price settings payload must be an object.");
    return { ok: false, errors: capList(errors) };
  }
  if (!isString(payload?.baseCurrency) || !payload.baseCurrency) {
    errors.push("price_settings.baseCurrency must be a non-empty string.");
  }
  if (!Array.isArray(payload?.currencies)) {
    errors.push("price_settings.currencies must be an array.");
  } else {
    payload.currencies.forEach((entry, index) => {
      const prefix = `price_settings.currencies[${index}]`;
      if (!isString(entry?.code) || !entry.code) errors.push(`${prefix}.code must be a string.`);
      if (!("rate" in entry)) errors.push(`${prefix}.rate is required.`);
    });
  }
  return { ok: errors.length === 0, errors: capList(errors) };
}

function validateMachineCategoriesJson(items) {
  const errors = [];
  if (!Array.isArray(items)) {
    errors.push("Machine categories payload must be an array.");
    return { ok: false, errors: capList(errors) };
  }
  const validateNode = (node, path) => {
    if (!isNumber(node?.id)) errors.push(`${path}.id must be a number.`);
    if (!isString(node?.key) || !node.key) errors.push(`${path}.key must be a non-empty string.`);
    if (!isString(node?.name)) errors.push(`${path}.name must be a string.`);
    if (!isNumber(node?.parent)) errors.push(`${path}.parent must be a number.`);
    if (typeof node?.lang_name !== "object") errors.push(`${path}.lang_name must be an object.`);
    if (typeof node?.lang_desc !== "object") errors.push(`${path}.lang_desc must be an object.`);
    if (Array.isArray(node?.children)) {
      node.children.forEach((child, idx) => validateNode(child, `${path}.children[${idx}]`));
    }
  };
  items.forEach((node, index) => validateNode(node, `machine_categories[${index}]`));
  return { ok: errors.length === 0, errors: capList(errors) };
}

function writeJsonValidated(path, payload, validator, label) {
  const validation = validator(payload);
  if (!validation.ok) {
    const details = validation.errors.items.slice(0, 10).join(" | ");
    throw new Error(`${label} validation failed: ${details}`);
  }
  writeFileSync(path, JSON.stringify(payload));
  return validation;
}

function writeContractManifest(jsonDir, entries) {
  const manifest = {
    version: JSON_CONTRACT_VERSION,
    generated_at: new Date().toISOString(),
    files: entries
  };
  const manifestPath = resolve(jsonDir, "_contract.json");
  writeFileSync(manifestPath, JSON.stringify(manifest));
  return manifestPath;
}

export {
  validateCategoriesJson,
  validateProductsJson,
  validatePriceSettingsJson,
  validateMachineCategoriesJson,
  writeJsonValidated,
  writeContractManifest
};
