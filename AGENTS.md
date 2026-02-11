## AGENTS.md: AI Collaboration Guide

---

### ?? AI Executive Summary (CRITICAL)

Spare Parts Manager is a local, full-stack tool for importing and maintaining a spare-parts catalog. It ingests CSV trees and WordPress cached JSON, manages category/product structures, images, and pricing, and emits static JSON caches for downstream consumption. The system is a single repo with a Svelte SPA and a Node/Express API backed by SQLite; it also contains a CE/Motorintyg document subsystem that generates PDFs from templates and stores them locally.

Architectural complexity is moderate: a monolithic API with embedded schema migrations, heavy file I/O, and multiple data import paths that can mutate core tables and outputs. Stability is “operational but still evolving” (few guardrails, no automated tests or CI, and many one-off import/repair scripts in the repo). The primary risks are data integrity (schema and import correctness), file path correctness (local absolute paths in `.env`), and subtle coupling between DB schema, JSON outputs, and the UI’s expectations.

AI changes should be cautious around DB schema, import logic, and JSON output formats, and more permissive for UI/UX, docs, and isolated scripts. The codebase favors pragmatic, direct logic over abstraction; small, surgical modifications are safest.

**Recommended AI Behavior:**  
Balanced — move confidently on UI and scripts, but be conservative around DB schema, import pipelines, auth/session logic, and JSON output contracts.

---

## 1. Project Overview & Purpose

- **Primary Goal**: Provide a local management UI and API for importing spare-parts catalog data, maintaining product/category relationships, images, and pricing, and generating static JSON caches.
- **Business Domain**: Spare parts catalog management and document generation (CE/Motorintyg).
- **Likely Users**: Internal catalog managers and administrators.
- **Core Value Proposition**: A single tool to ingest CSV/WordPress data, manage catalog data, and produce consumable JSON for other systems.

---

## 2. Project Maturity Assessment

**Classification: MVP**

Reasoning: There is a complete UI + API, schema, and operational scripts, but no automated tests, no visible CI/CD, and many ad-hoc import/debug scripts in the repo. This suggests an operational internal tool still evolving rather than a hardened production service.

---

## 3. Core Technologies & Stack

- **Languages**: JavaScript (ESM), Svelte (frontend components)
- **Frameworks / Runtimes**: Node.js, Express, Vite, Svelte 5
- **Databases / Storage**: SQLite (primary), file system for images, PDFs, JSON outputs
- **Key Dependencies**: `express`, `multer` (uploads), `csv-parse`, `adm-zip`, `pdf-lib`, `playwright` (PDF generation), `dotenv`
- **Package Manager**: npm
- **Build System**: Vite
- **Target Platforms**: Local development environment (Windows paths appear in `.env.example`)
- **Containerization / Orchestration**: None observed

---

## 4. Architecture & System Design

### Overall Architecture

**Modular monolith**: a single repo with a Svelte SPA frontend and an Express API backend. Data imports, schema migrations, and CE PDF generation are all in the same runtime and filesystem domain.

### Directory Structure Philosophy

- `src/`: Svelte SPA (admin UI + public pages)
- `server/`: Express API and import/maintenance scripts
- `db/`: SQLite schema
- `data/`: local database and working files
- `output/`: generated JSON caches
- `storage/`: catalog and category images
- `ce/`: CE/Motorintyg templates, dumps, PDFs, and CE database
- `public/`: static assets served by Vite

### Module Organization

- UI is composed of Svelte components grouped by feature panels (import, pricing, machine categories, users, etc.).
- Backend organizes logic in `server/index.js` with route registration, data import, and schema migrations, plus a CE subsystem (`server/ce-api.js`) and task scripts.
- Utilities and API calls are in `src/lib/`.

### Likely Role in a Larger System

**Internal tooling**: This repo appears to produce static JSON and images that other systems consume. It’s not a standalone public service; it’s a catalog administration and generation tool.

---

## 5. Critical Invariants (DO NOT BREAK)

- **Database schema contracts** in `db/schema.sql` and the runtime migrations in `server/index.js` must remain compatible with existing data.
- **Category keys and product SKUs** are primary identifiers referenced across tables, outputs, and the UI.
- **JSON output shapes** in `output/json` are treated as public artifacts; changes can break downstream consumers.
- **File system locations** for images, PDFs, and JSON outputs are assumed by the UI and scripts.
- **Auth/session hashing** (scrypt + session hash) must remain stable for existing users.

---

## 6. Coding Conventions & Style

- **Formatting**: Standard JS style; minimal inline comments; pragmatic, direct logic.
- **Naming**: Lower-camel for JS, kebab in filenames for scripts; Svelte components in PascalCase.
- **Organization**: Feature-driven components and API functions grouped by domain.
- **Type Usage**: No TypeScript; runtime checks and defensive parsing are used instead.

### API Design Philosophy

- REST-style JSON endpoints for CRUD and import operations.
- Pragmatic responses (no strict schema typing) favoring operational ease over formal contracts.

### Common Patterns & Idioms

- `fetch` wrappers in `src/lib/api.js` for API calls.
- Explicit file uploads via `multer`.
- SQLite migrations executed at app startup.
- Batch data imports via CSV parsing and ZIP extraction.

### Error Handling Strategy

- Mostly exceptions and `try/catch` with error messages returned as strings.
- Minimal retry logic; operational issues bubble up to logs or UI.

---

## 7. Key Files & Entrypoints

- `server/index.js`: Express API entrypoint, DB open/migrations, routes, import logic.
- `server/ce-api.js`: CE/Motorintyg API and PDF generation.
- `src/main.js`: SPA bootstrap.
- `src/App.svelte`: Main UI shell and routing.
- `db/schema.sql`: Core schema definition.
- `vite.config.js`: Frontend build configuration.
- `.env` / `.env.example`: Environment and filesystem path configuration.

---

## 8. Development & Testing Workflow

### Local Setup

- `npm install`
- Configure `.env` (copy `.env.example` and adjust paths)

### Build / Run

- `npm run api` for the Express backend
- `npm run dev` for the Svelte UI
- `npm run build` for production builds

### Testing

- No test framework or test scripts observed.

### CI/CD Behavior

- No CI/CD configuration found; likely manual or local workflows.

---

## 9. Security Posture

- Local tool, but exposes an HTTP API; session cookies and password hashing are present.
- File uploads (CSV/ZIP) are accepted; risk of malformed files or zip bombs if misused.
- Uses filesystem paths from env vars; misconfiguration can lead to data loss or exposure.
- Minimal validation boundaries suggest careful handling of inputs is required.

---

## 10. Safe Change Strategy for AI Agents

**SAFE**
- Documentation
- UI layout tweaks in Svelte components
- Isolated utility scripts

**USE CAUTION**
- Environment variable defaults
- Import scripts and CSV parsing
- Build and Vite config

**HIGH RISK**
- SQLite schema and migrations
- Core API routes
- JSON output formats and file paths
- Auth/session logic

---

## 11. Collaboration Signals

- Appears maintained by a small team or a single engineer.
- Emphasis on speed and pragmatic fixes (many one-off scripts, minimal abstraction).
- Stability is functional but not rigorously enforced by tests or CI.

---

## 12. Observed Gaps & Recommendations

1. Add basic automated tests for import parsing and JSON generation.
2. Add CI for lint/test/build to prevent regression.
3. Introduce minimal schema migration tooling or versioning to reduce risk.
4. Document JSON output schemas for downstream consumers.
5. Add structured logging around imports and file writes.

---

## 13. Contribution & Dependency Guidelines

No CONTRIBUTING file found. Suggested defaults:

- Prefer small, isolated changes.
- Keep dependencies minimal; justify additions in `package.json`.
- Validate imports with a dry-run path before writing to DB or output.

---

## 14. Commit Culture

Git history not inspected. Recommended for an MVP tool:

- Use short, descriptive commits.
- Prefer feature branches with squash merges.
- If adopting conventions, `feat:`, `fix:`, `chore:` prefixes would fit.

---

## 15. AI Collaboration Directives (VERY IMPORTANT)

**Preferred Behavior**
- Make small, surgical changes.
- Preserve existing data flows and file paths.
- Validate assumptions against `db/schema.sql` and `src/lib/api.js`.

**Things to Avoid**
- Renaming DB columns or changing JSON outputs without explicit approval.
- Refactors that move or rename filesystem locations.
- Introducing new frameworks or build tooling.

**When to Ask for Human Approval**
- Any schema changes or migration logic edits.
- Changes to import pipelines or CSV/JSON formats.
- Altering auth/session logic or CE PDF generation.

**How Bold an AI May Be**
- Moderate: confident with UI polish and documentation, cautious with data and API logic.
