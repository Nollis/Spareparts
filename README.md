# Spare Parts Manager (local)

Lean importer that turns a product tree CSV + images ZIP into static JSON files.

## Quick start

1. Install deps:
   npm install
2. Start API:
   npm run api
3. Start UI:
   npm run dev
4. Run migrations (optional):
   npm run migrate

## Files

- Data DB: data/manager.sqlite
- DB migrations: server/migrations (tracked in schema_versions table)
- Category images: storage/spare-part-images
- Catalog images: storage/product-catalog-images
- JSON output: output/json
- Price settings JSON: output/json/price-settings.json
- Machine categories JSON: output/json/machine-categories.json
- JSON contract manifest: output/json/_contract.json (version + generated file list)
- Image maps: stored in `image_maps` table (managed in UI)

JSON contract policy:
- The `_contract.json` version is the authoritative export contract.
- Bump major on breaking schema changes, minor on additive fields, patch on fixes.

## CE / Motorintyg

CE data, templates, and PDFs live under `ce/`. The CE API is mounted at `/api/ce` (and also `/wp-json/wccd/v1` for compatibility).

Scripts:
- `npm run ce:import-dumps` to import SQL dumps from `ce/dumps/`
- `npm run ce:cleanup-serials` to normalize serial numbers

## Machine categories import

Import machine categories from the WordPress JSON cache:

- `npm run machine-categories:import`

Optional flags:
- `--file <path>` to override the JSON file path
- `--append` to keep existing machine categories and update/insert instead of clearing

## Import products/categories from WP cached JSON

Use the cached JSON files from the WordPress plugin:

- `npm run wp:import-cached-json`

Optional flags:
- `--dir <path>` to override the cached JSON directory
- `--main <key>` to import a single main key only

## CSV format

Header:

type;category_path;artikel_id;name_sv;desc_sv;name_en;desc_en;number;no_units

Types:
- produkt (main product)
- kategori
- artikel

Category paths use backslash to separate levels:

f50\engine\engine-parts

## Notes

- The UI and JSON use "key" for category identifiers.
