import bcrypt from 'bcryptjs';
import { pool } from '../src/config/database.js';

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const name = process.env.ADMIN_FULL_NAME?.trim();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !name || !password || password.length < 16) {
    throw new Error('Set ADMIN_EMAIL, ADMIN_FULL_NAME and ADMIN_PASSWORD (at least 16 characters) before running this script.');
  }
  const hash = await bcrypt.hash(password, 12);
  await pool.query(
    `INSERT INTO users (email, full_name, password_hash, role, account_status, identity_verification_status)
     VALUES ($1, $2, $3, 'admin', 'active', 'unverified')`, [email, name, hash]
  );
  console.log(`Administrator account created for ${email}. Remove ADMIN_PASSWORD from the environment now.`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => pool.end());
