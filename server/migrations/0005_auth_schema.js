export const id = "0005_auth_schema";

function ensureColumn(db, table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.length) return;
  if (!columns.some((col) => col.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  }
}

export function up(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    customer_number TEXT,
    discount_percent INTEGER DEFAULT 0,
    country_code TEXT,
    no_pyramid_import INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS users (
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
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS delivery_addresses (
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
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    session_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    last_seen_at TEXT DEFAULT (datetime('now')),
    ip TEXT,
    user_agent TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);

  ensureColumn(db, "companies", "customer_number", "customer_number TEXT");
  ensureColumn(db, "companies", "discount_percent", "discount_percent INTEGER DEFAULT 0");
  ensureColumn(db, "companies", "country_code", "country_code TEXT");
  ensureColumn(db, "companies", "no_pyramid_import", "no_pyramid_import INTEGER DEFAULT 0");
  ensureColumn(db, "companies", "updated_at", "updated_at TEXT DEFAULT (datetime('now'))");

  ensureColumn(db, "users", "first_name", "first_name TEXT");
  ensureColumn(db, "users", "last_name", "last_name TEXT");
  ensureColumn(db, "users", "phone", "phone TEXT");
  ensureColumn(db, "users", "company_id", "company_id INTEGER");
  ensureColumn(db, "users", "status", "status TEXT DEFAULT 'pending'");
  ensureColumn(db, "users", "is_order_manager", "is_order_manager INTEGER DEFAULT 0");
  ensureColumn(db, "users", "is_ce_admin", "is_ce_admin INTEGER DEFAULT 0");
  ensureColumn(db, "users", "selected_delivery_address_id", "selected_delivery_address_id INTEGER");
  ensureColumn(db, "users", "billing_name", "billing_name TEXT");
  ensureColumn(db, "users", "billing_street", "billing_street TEXT");
  ensureColumn(db, "users", "billing_street_2", "billing_street_2 TEXT");
  ensureColumn(db, "users", "billing_zip_code", "billing_zip_code TEXT");
  ensureColumn(db, "users", "billing_postal_area", "billing_postal_area TEXT");
  ensureColumn(db, "users", "billing_country", "billing_country TEXT");
  ensureColumn(db, "users", "billing_email", "billing_email TEXT");
  ensureColumn(db, "users", "billing_org_number", "billing_org_number TEXT");
  ensureColumn(db, "users", "shipping_attn_first_name", "shipping_attn_first_name TEXT");
  ensureColumn(db, "users", "shipping_attn_last_name", "shipping_attn_last_name TEXT");
  ensureColumn(db, "users", "shipping_street", "shipping_street TEXT");
  ensureColumn(db, "users", "shipping_street_2", "shipping_street_2 TEXT");
  ensureColumn(db, "users", "shipping_zip_code", "shipping_zip_code TEXT");
  ensureColumn(db, "users", "shipping_postal_area", "shipping_postal_area TEXT");
  ensureColumn(db, "users", "shipping_country", "shipping_country TEXT");
  ensureColumn(db, "users", "updated_at", "updated_at TEXT DEFAULT (datetime('now'))");

  ensureColumn(db, "delivery_addresses", "attn_first_name", "attn_first_name TEXT");
  ensureColumn(db, "delivery_addresses", "attn_last_name", "attn_last_name TEXT");
  ensureColumn(db, "delivery_addresses", "street", "street TEXT");
  ensureColumn(db, "delivery_addresses", "street_2", "street_2 TEXT");
  ensureColumn(db, "delivery_addresses", "zip_code", "zip_code TEXT");
  ensureColumn(db, "delivery_addresses", "postal_area", "postal_area TEXT");
  ensureColumn(db, "delivery_addresses", "country", "country TEXT");
  ensureColumn(db, "delivery_addresses", "delivery_id", "delivery_id TEXT");
  ensureColumn(db, "delivery_addresses", "updated_at", "updated_at TEXT DEFAULT (datetime('now'))");

  ensureColumn(db, "sessions", "last_seen_at", "last_seen_at TEXT DEFAULT (datetime('now'))");
  ensureColumn(db, "sessions", "ip", "ip TEXT");
  ensureColumn(db, "sessions", "user_agent", "user_agent TEXT");

  db.exec("CREATE INDEX IF NOT EXISTS idx_users_company ON users(company_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_users_status ON users(status)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_delivery_addresses_company ON delivery_addresses(company_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)");
}

export default { id, up };
