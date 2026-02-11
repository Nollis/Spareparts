-- CE/Motorintyg local schema (SQLite)
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS ce_models (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  modellNamn TEXT NOT NULL UNIQUE,
  main_product_slug TEXT NOT NULL DEFAULT '',
  maskinslag_ce TEXT NOT NULL DEFAULT '',
  maskinslag TEXT NOT NULL DEFAULT '',
  fabrikat TEXT NOT NULL DEFAULT '',
  motorfabrikat TEXT NOT NULL DEFAULT '',
  motoreffekt TEXT NOT NULL DEFAULT '',
  motorvolym TEXT NOT NULL DEFAULT '',
  uppfyller_avgaskrav TEXT NOT NULL DEFAULT '',
  certifikat_nummer TEXT NOT NULL DEFAULT '',
  rek_bransle TEXT NOT NULL DEFAULT '',
  originalmotor TEXT NOT NULL DEFAULT '',
  hyudralolja TEXT NOT NULL DEFAULT '',
  harmoniserande_standarder TEXT NOT NULL DEFAULT '',
  enligt_villkoren_i_direktiv TEXT NOT NULL DEFAULT '',
  anmalt_organ_for_direktiv TEXT NOT NULL DEFAULT '',
  uppmatt_ljudeffektniva TEXT NOT NULL DEFAULT '',
  garanterad_ljud_och_effektniva TEXT NOT NULL DEFAULT '',
  namn_och_underskrift TEXT NOT NULL DEFAULT '',
  is_dynapac_ce INTEGER NOT NULL DEFAULT 0,
  maskin_marke TEXT NOT NULL DEFAULT '',
  created_for_ce_search INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ce_products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  serienummer TEXT NOT NULL UNIQUE,
  modell TEXT NOT NULL DEFAULT '',
  motornummer TEXT NOT NULL DEFAULT '',
  tillverkningsar TEXT NOT NULL DEFAULT '',
  godkand_av TEXT NOT NULL DEFAULT '',
  maskinslag_ce TEXT NOT NULL DEFAULT '',
  maskinslag TEXT NOT NULL DEFAULT '',
  fabrikat TEXT NOT NULL DEFAULT '',
  motorfabrikat TEXT NOT NULL DEFAULT '',
  motoreffekt TEXT NOT NULL DEFAULT '',
  motorvolym TEXT NOT NULL DEFAULT '',
  uppfyller_avgaskrav TEXT NOT NULL DEFAULT '',
  certifikat_nummer TEXT NOT NULL DEFAULT '',
  rek_bransle TEXT NOT NULL DEFAULT '',
  originalmotor TEXT NOT NULL DEFAULT '',
  hyudralolja TEXT NOT NULL DEFAULT '',
  harmoniserande_standarder TEXT NOT NULL DEFAULT '',
  enligt_villkoren_i_direktiv TEXT NOT NULL DEFAULT '',
  anmalt_organ_for_direktiv TEXT NOT NULL DEFAULT '',
  uppmatt_ljudeffektniva TEXT NOT NULL DEFAULT '',
  garanterad_ljud_och_effektniva TEXT NOT NULL DEFAULT '',
  namn_och_underskrift TEXT NOT NULL DEFAULT '',
  is_dynapac_ce INTEGER NOT NULL DEFAULT 0,
  maskin_marke TEXT NOT NULL DEFAULT '',
  has_been_printed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ce_products_modell ON ce_products (modell);
CREATE INDEX IF NOT EXISTS idx_ce_models_modellnamn ON ce_models (modellNamn);