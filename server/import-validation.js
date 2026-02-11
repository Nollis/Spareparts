import { basename, extname } from "node:path";
import { parse } from "csv-parse/sync";
import AdmZip from "adm-zip";

const ALLOWED_IMPORT_TYPES = new Set(["produkt", "kategori", "artikel"]);
const ZIP_ALLOWED_EXTS = new Set([".jpg", ".jpeg", ".png", ".gif", ".svg", ".webp"]);

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\u00c3\u00a5|\u00e5/g, "a")
    .replace(/\u00c3\u00a4|\u00e4/g, "a")
    .replace(/\u00c3\u00b6|\u00f6/g, "o")
    .replace(/\s+/g, "_");
}

function normalizeText(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim();
}

function createKeyFromPath(pathValue) {
  return normalizeText(pathValue).replace(/\\/g, "-").toLowerCase();
}

function sanitizeFileName(fileName) {
  let result = String(fileName || "").trim().toLowerCase();
  result = result.replace(/\u00c3\u00a5|\u00e5/g, "a");
  result = result.replace(/\u00c3\u00a4|\u00e4/g, "a");
  result = result.replace(/\u00c3\u00b6|\u00f6/g, "o");
  result = result.replace(/\s+/g, "_");
  result = result.replace(/--/g, "-");
  result = result.replace(/%20/g, "_");
  result = result.replace(/\[comma\]/gi, ",");
  result = result.replace(/[^a-z0-9_-]/g, "");
  return result;
}

function capList(list, max = 50) {
  const items = Array.isArray(list) ? list : [];
  return { total: items.length, items: items.slice(0, max) };
}

function parseCsv(buffer) {
  return parse(buffer, {
    columns: (header) => header.map(normalizeHeader),
    delimiter: ";",
    skip_empty_lines: true,
    bom: true,
    relax_quotes: true,
    relax_column_count: true
  });
}

function validateProductImport(records) {
  const errors = [];
  const warnings = [];
  const duplicateSkus = new Set();
  const duplicateCategories = new Set();
  const skuSeen = new Map();
  const categorySeen = new Map();
  const counts = {
    rows: Array.isArray(records) ? records.length : 0,
    produkt: 0,
    kategori: 0,
    artikel: 0,
    missingType: 0,
    invalidType: 0,
    missingCategoryPath: 0,
    missingSku: 0
  };

  (records || []).forEach((row, index) => {
    const rowNum = index + 1;
    const type = normalizeText(row?.type).toLowerCase();
    if (!type) {
      counts.missingType += 1;
      errors.push(`Row ${rowNum}: missing type.`);
      return;
    }
    if (!ALLOWED_IMPORT_TYPES.has(type)) {
      counts.invalidType += 1;
      errors.push(`Row ${rowNum}: invalid type "${type}".`);
      return;
    }
    counts[type] += 1;

    const pathValue = normalizeText(row?.category_path);
    if (!pathValue) {
      counts.missingCategoryPath += 1;
      errors.push(`Row ${rowNum}: missing category_path for ${type}.`);
      return;
    }
    const key = createKeyFromPath(pathValue);
    if (!key) {
      errors.push(`Row ${rowNum}: invalid category_path "${pathValue}".`);
      return;
    }

    if (type === "artikel") {
      const sku = normalizeText(row?.artikel_id);
      if (!sku) {
        counts.missingSku += 1;
        errors.push(`Row ${rowNum}: missing artikel_id for artikel.`);
        return;
      }
      if (skuSeen.has(sku)) {
        duplicateSkus.add(sku);
      } else {
        skuSeen.set(sku, rowNum);
      }
      return;
    }

    if (categorySeen.has(key)) {
      duplicateCategories.add(key);
    } else {
      categorySeen.set(key, rowNum);
    }
  });

  if (duplicateSkus.size) {
    warnings.push(`Duplicate SKUs found: ${Array.from(duplicateSkus).slice(0, 10).join(", ")}`);
  }
  if (duplicateCategories.size) {
    warnings.push(
      `Duplicate category keys found: ${Array.from(duplicateCategories).slice(0, 10).join(", ")}`
    );
  }

  return {
    ok: errors.length === 0,
    counts,
    errors: capList(errors),
    warnings: capList(warnings),
    duplicates: {
      skus: capList(Array.from(duplicateSkus)),
      categories: capList(Array.from(duplicateCategories))
    }
  };
}

function validateZipImages(buffer) {
  const zip = new AdmZip(buffer);
  const duplicateBases = new Set();
  const invalidSamples = [];
  const seenBases = new Set();
  let totalEntries = 0;
  let fileEntries = 0;
  let invalidExt = 0;

  zip.getEntries().forEach((entry) => {
    if (entry.isDirectory) {
      return;
    }
    totalEntries += 1;
    const ext = extname(entry.entryName).toLowerCase();
    const base = sanitizeFileName(basename(entry.entryName, ext));
    if (!ext || !base || !ZIP_ALLOWED_EXTS.has(ext)) {
      invalidExt += 1;
      if (invalidSamples.length < 50) {
        invalidSamples.push(entry.entryName);
      }
      return;
    }
    fileEntries += 1;
    if (seenBases.has(base)) {
      duplicateBases.add(base);
      return;
    }
    seenBases.add(base);
  });

  return {
    totalEntries,
    fileEntries,
    invalidExt,
    duplicateBases: capList(Array.from(duplicateBases)),
    invalidSamples: capList(invalidSamples)
  };
}

export {
  normalizeHeader,
  parseCsv,
  validateProductImport,
  validateZipImages,
  normalizeText,
  createKeyFromPath,
  sanitizeFileName
};
