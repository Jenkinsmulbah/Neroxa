import bcrypt from 'bcryptjs';
import type { PoolClient } from 'pg';
import { pool } from '../../config/database.js';
import { HttpError } from '../../shared/http-error.js';
import type { Role } from '../../shared/roles.js';

const publicUser = (row: any) => ({
  id: row.id, email: row.email, fullName: row.full_name, role: row.role,
  accountStatus: row.account_status, identityVerificationStatus: row.identity_verification_status
});

export async function registerFromApprovedApplication(reference: string, email: string, password: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const application = await client.query(
      `SELECT id, application_type, applicant_email, application_data, status
       FROM applications WHERE upper(reference) = upper($1) FOR UPDATE`, [reference]
    );
    const record = application.rows[0];
    if (!record || record.status !== 'Approved') throw new HttpError(403, 'An approved application is required before account activation.', 'APPLICATION_NOT_APPROVED');
    if (record.applicant_email.toLowerCase() !== email.toLowerCase()) throw new HttpError(403, 'The email address must match the approved application.', 'APPLICATION_EMAIL_MISMATCH');
    const role: Role = record.application_type === 'client' ? 'client' : 'designer';
    const fullName = String(record.application_data?.applicantName || record.application_data?.fullName || '').trim();
    if (!fullName) throw new HttpError(422, 'The approved application does not contain an applicant name.', 'APPLICATION_PROFILE_INCOMPLETE');
    const passwordHash = await bcrypt.hash(password, 12);
    const inserted = await client.query(
      `INSERT INTO users (email, full_name, password_hash, role, account_status, identity_verification_status, application_id)
       VALUES (lower($1), $2, $3, $4, 'active', 'unverified', $5)
       RETURNING id, email, full_name, role, account_status, identity_verification_status`,
      [email, fullName, passwordHash, role, record.id]
    );
    await client.query('UPDATE applications SET applicant_user_id = $1, updated_at = now() WHERE id = $2', [inserted.rows[0].id, record.id]);
    await client.query(
      `INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, metadata)
       VALUES (NULL, 'ACCOUNT_CREATED_FROM_APPROVED_APPLICATION', 'user', $1, jsonb_build_object('applicationId', $2, 'role', $3))`,
      [inserted.rows[0].id, record.id, role]
    );
    await client.query('COMMIT');
    return publicUser(inserted.rows[0]);
  } catch (error: any) {
    await client.query('ROLLBACK');
    if (error?.code === '23505') throw new HttpError(409, 'An account already exists for this email or application.', 'ACCOUNT_ALREADY_EXISTS');
    throw error;
  } finally { client.release(); }
}

export async function authenticate(email: string, password: string) {
  const result = await pool.query(
    `SELECT u.id, u.email, u.full_name, u.password_hash, CASE WHEN oc.owner_user_id IS NOT NULL THEN 'owner' ELSE u.role::text END AS role, u.account_status, u.identity_verification_status
     FROM users u LEFT JOIN owner_configuration oc ON oc.owner_user_id=u.id WHERE lower(u.email) = lower($1) LIMIT 1`, [email]
  );
  const user = result.rows[0];
  // Use a dummy hash comparison for unknown addresses to reduce timing-based account enumeration.
  const hash = user?.password_hash || '$2b$12$C6UzMDM.H6dfI/f/IKcEe.8dKZ8Z5Z6Z5Z6Z5Z6Z5Z6Z5Z6Z5Z6Z5';
  const valid = await bcrypt.compare(password, hash).catch(() => false);
  if (!user || !valid) throw new HttpError(401, 'Email or password is incorrect.', 'INVALID_CREDENTIALS');
  if (user.account_status !== 'active') throw new HttpError(403, 'This account is not active. Contact NEXORA support.', 'ACCOUNT_NOT_ACTIVE');
  return publicUser(user);
}

export async function recordLogin(userId: string, reqMeta: { ip?: string; userAgent?: string }) {
  await pool.query('UPDATE users SET last_login_at = now(), updated_at = now() WHERE id = $1', [userId]);
  await pool.query(
    `INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, metadata)
     VALUES ($1, 'AUTHENTICATION_SUCCEEDED', 'user', $1, jsonb_build_object('ip', $2, 'userAgent', $3))`,
    [userId, reqMeta.ip || null, reqMeta.userAgent || null]
  );
}
