import bcrypt from 'bcryptjs';
import { pool } from '../src/config/database.js';

async function main() {
  const email = process.env.OWNER_EMAIL?.trim().toLowerCase();
  const name = process.env.OWNER_FULL_NAME?.trim();
  const password = process.env.OWNER_PASSWORD;
  if (!email || !name || !password || password.length < 16) throw new Error('Set OWNER_EMAIL, OWNER_FULL_NAME and OWNER_PASSWORD (at least 16 characters).');
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const existing = await db.query("SELECT 1 FROM owner_configuration LIMIT 1");
    if (existing.rowCount) throw new Error('A NEXORA Owner is already configured. Owner bootstrap can run only once.');
    const hash = await bcrypt.hash(password, 12);
    const created = await db.query(`INSERT INTO users(email,full_name,password_hash,role,account_status,identity_verification_status)
      VALUES(lower($1),$2,$3,'admin','active','verified') RETURNING id,email`, [email,name,hash]);
    await db.query('INSERT INTO owner_configuration(singleton,owner_user_id) VALUES(TRUE,$1)', [created.rows[0].id]);
    await db.query(`INSERT INTO audit_logs(actor_user_id,action,target_type,target_id,metadata)
      VALUES($1,'OWNER_BOOTSTRAPPED','user',$1,jsonb_build_object('email',$2))`, [created.rows[0].id,email]);
    await db.query('COMMIT');
    console.log(`NEXORA Owner account provisioned for ${email}. Remove OWNER_PASSWORD from the environment.`);
  } catch (e) { await db.query('ROLLBACK').catch(()=>undefined); throw e; }
  finally { db.release(); }
}
main().catch(e=>{ console.error(e.message); process.exitCode=1; }).finally(()=>pool.end());
