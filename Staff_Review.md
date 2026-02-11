## Executive Risk Map
1. SQLite single-file DB with in-process migrations on app start: concurrent writers, schema drift, and long-running import tasks risk corruption or lock contention under load.
2. Import pipelines and CSV/ZIP ingestion are tightly coupled to DB schema and file paths; minimal validation means malformed inputs can silently poison core data and JSON outputs.
3. Auth/session handling is custom and local; cookie/session lifecycle, password policy, and auditability are fragile without tests and without explicit security hardening.
4. JSON output cache is a critical contract with downstream consumers but has no formal schema, versioning, or validation; any change can break consumers without warning.
5. Operational coupling to local Windows paths and `.env` values makes deployability and reproducibility brittle; misconfiguration can destroy data or write to wrong locations.

## Highest-Leverage Improvements
1. Introduce a versioned data export contract: define JSON schemas for `output/json/*`, validate on write, and add a version header to the exported payloads.
2. Add a lightweight migration system with explicit versions instead of ad-hoc `ALTER TABLE` at startup; include a “schema version” table and migrations directory.
3. Implement robust import validation and dry-run mode: schema checks, duplicate detection, and consistency reports before writing to DB and files.
4. Add minimal automated tests around import parsing and JSON generation (golden file tests) plus a CI pipeline to run them.
5. Centralize configuration and path validation at startup with explicit error messages (fail fast if required paths or permissions are missing).

## What I Would Fix In The Next 30 Days
1. Build a migration framework and migrate existing schema logic into versioned scripts; add a schema version check during startup.
2. Add import validation with a dry-run summary (counts, duplicates, invalid fields) and require confirmation before writes for destructive actions.
3. Define JSON export schemas and add runtime validation + version tags; add a backward-compatibility policy.
4. Add tests for key import flows (CSV tree, WP cached JSON, image map imports) and for JSON export consistency.
5. Add a minimal CI workflow to run `npm test` (new) and `npm run build` to block regressions.

## What Will Break First At Scale
- SQLite write contention: concurrent imports and UI edits will hit `busy_timeout` and fail or stall.
- File I/O bottlenecks: large ZIPs and image operations will block the event loop, slowing the API.
- Data integrity drift: repeated imports with partial or malformed data will accumulate inconsistent category/product mappings.
- Output cache inconsistency: downstream systems will read JSON during partial generation, leading to inconsistent catalog states.
- Auth/session limits: session table grows without cleanup; stale sessions and unbounded storage will become operational debt.

## Architecture Upgrade Path
- Auth: move from local session tables to a dedicated auth service or add JWT-based sessions with rotation; standardize password policies and add audit logging.
- API contracts: define OpenAPI for all endpoints and generate typed clients for the Svelte app; add explicit response shapes and error contracts.
- State management: introduce a store layer (Svelte stores with domain modules) to decouple UI from fetch logic; normalize category/product data to reduce re-fetching.
- Data layer: migrate from SQLite to Postgres once concurrent usage or data size grows; keep a migration path with scripts that can run on both.
- Testing: adopt integration tests that spin up the API with a temp DB and validate imports/exports; add snapshot tests for JSON outputs.
- Background processing: move heavy imports and PDF generation to a job queue with status tracking and retry (e.g., BullMQ or a separate worker process).
- Observability: add structured logs with correlation IDs, and basic metrics for import durations, error rates, and JSON export sizes.
