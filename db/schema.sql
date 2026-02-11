CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  path TEXT NOT NULL,
  name_sv TEXT,
  desc_sv TEXT,
  name_en TEXT,
  desc_en TEXT,
  name_pl TEXT,
  desc_pl TEXT,
  position INTEGER,
  parent_key TEXT,
  is_main INTEGER DEFAULT 0,
  catalog_image TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT NOT NULL UNIQUE,
  name_sv TEXT,
  desc_sv TEXT,
  name_en TEXT,
  desc_en TEXT,
  name_pl TEXT,
  desc_pl TEXT,
  pos_num INTEGER,
  no_units TEXT,
  price TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS product_categories (
  product_sku TEXT NOT NULL,
  category_key TEXT NOT NULL,
  pos_num INTEGER NOT NULL DEFAULT 0,
  no_units TEXT,
  PRIMARY KEY (product_sku, category_key, pos_num)
);

CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_key);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_product_categories_cat ON product_categories(category_key);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS machine_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  name_sv TEXT,
  name_en TEXT,
  position INTEGER DEFAULT 0,
  parent_id INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS machine_category_product_categories (
  machine_category_id INTEGER NOT NULL,
  category_key TEXT NOT NULL,
  position INTEGER DEFAULT 0,
  show_for_lang TEXT,
  PRIMARY KEY (machine_category_id, category_key)
);

CREATE INDEX IF NOT EXISTS idx_machine_categories_parent ON machine_categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_machine_category_links_cat ON machine_category_product_categories(category_key);

CREATE TABLE IF NOT EXISTS image_maps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_key TEXT NOT NULL UNIQUE,
  html TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_image_maps_category ON image_maps(category_key);

CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  customer_number TEXT,
  discount_percent INTEGER DEFAULT 0,
  country_code TEXT,
  no_pyramid_import INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  company_id INTEGER,
  status TEXT DEFAULT 'pending',
  is_order_manager INTEGER DEFAULT 0,
  is_ce_admin INTEGER DEFAULT 0,
  selected_delivery_address_id INTEGER,
  billing_name TEXT,
  billing_street TEXT,
  billing_street_2 TEXT,
  billing_zip_code TEXT,
  billing_postal_area TEXT,
  billing_country TEXT,
  billing_email TEXT,
  billing_org_number TEXT,
  shipping_attn_first_name TEXT,
  shipping_attn_last_name TEXT,
  shipping_street TEXT,
  shipping_street_2 TEXT,
  shipping_zip_code TEXT,
  shipping_postal_area TEXT,
  shipping_country TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (company_id) REFERENCES companies(id)
);

CREATE INDEX IF NOT EXISTS idx_users_company ON users(company_id);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

CREATE TABLE IF NOT EXISTS delivery_addresses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  attn_first_name TEXT,
  attn_last_name TEXT,
  street TEXT,
  street_2 TEXT,
  zip_code TEXT,
  postal_area TEXT,
  country TEXT,
  delivery_id TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (company_id) REFERENCES companies(id)
);

CREATE INDEX IF NOT EXISTS idx_delivery_addresses_company ON delivery_addresses(company_id);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  session_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  last_seen_at TEXT DEFAULT (datetime('now')),
  ip TEXT,
  user_agent TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS schema_versions (
  version TEXT PRIMARY KEY,
  applied_at TEXT DEFAULT (datetime('now'))
);
