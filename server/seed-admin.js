import "dotenv/config";
import { randomBytes, scryptSync } from "node:crypto";
import { initDb, queryGet, queryRun } from "./db.js";

const email = (process.env.MANAGER_ADMIN_EMAIL || "admin@example.com").trim().toLowerCase();
const password = (process.env.MANAGER_ADMIN_PASSWORD || "admin123").trim();
const companyName = (process.env.MANAGER_ADMIN_COMPANY || "Swepac Dev").trim();

function hashPassword(value) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(value, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

async function main() {
  await initDb();

  const existing = await queryGet("SELECT id FROM users WHERE email = ?", [email]);
  if (existing) {
    console.log(`Admin already exists: ${email}`);
    return;
  }

  let company = await queryGet("SELECT id FROM companies WHERE name = ?", [companyName]);
  if (!company?.id) {
    await queryRun(
      `INSERT INTO companies (name, customer_number, discount_percent, created_at, updated_at)
       VALUES (?, ?, ?, datetime('now'), datetime('now'))`
      ,
      [companyName, "DEV", 0]
    );
    company = await queryGet("SELECT id FROM companies WHERE name = ?", [companyName]);
  }

  if (!company?.id) {
    throw new Error("Failed to resolve company id for admin seed.");
  }

  await queryRun(
    `INSERT INTO users (
       email, password_hash, first_name, last_name, phone, company_id,
       status, is_order_manager, is_ce_admin, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, 'active', 1, 1, datetime('now'), datetime('now'))`,
    [email, hashPassword(password), "Admin", "User", "", company.id]
  );

  console.log(`Seeded admin: ${email} / ${password}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
