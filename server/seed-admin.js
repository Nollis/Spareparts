import "dotenv/config";
import { DatabaseSync } from "node:sqlite";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes, scryptSync } from "node:crypto";

const dbPath = process.env.MANAGER_DB_PATH || resolve("data", "manager.sqlite");
const schemaPath = process.env.MANAGER_SCHEMA_PATH || resolve("db", "schema.sql");
const email = (process.env.MANAGER_ADMIN_EMAIL || "admin@example.com").trim().toLowerCase();
const password = (process.env.MANAGER_ADMIN_PASSWORD || "admin123").trim();
const companyName = (process.env.MANAGER_ADMIN_COMPANY || "Swepac Dev").trim();

function hashPassword(value) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(value, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

function openDatabase() {
  const db = new DatabaseSync(dbPath);
  if (existsSync(schemaPath)) {
    const schema = readFileSync(schemaPath, "utf8");
    db.exec(schema);
  }
  db.exec("PRAGMA busy_timeout = 5000;");
  return db;
}

const db = openDatabase();

const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
if (existing) {
  console.log(`Admin already exists: ${email}`);
  process.exit(0);
}

let companyId = null;
const company = db
  .prepare("SELECT id FROM companies WHERE name = ?")
  .get(companyName);
if (company?.id) {
  companyId = company.id;
} else {
  const res = db
    .prepare(
      `INSERT INTO companies (name, customer_number, discount_percent, created_at, updated_at)
       VALUES (?, ?, ?, datetime('now'), datetime('now'))`
    )
    .run(companyName, "DEV", 0);
  companyId = res.lastInsertRowid;
}

db.prepare(
  `INSERT INTO users (
     email, password_hash, first_name, last_name, phone, company_id,
     status, is_order_manager, is_ce_admin, created_at, updated_at
   ) VALUES (?, ?, ?, ?, ?, ?, 'active', 1, 1, datetime('now'), datetime('now'))`
).run(email, hashPassword(password), "Admin", "User", "", companyId);

console.log(`Seeded admin: ${email} / ${password}`);
