import type { Request, Response, NextFunction } from 'express';
import { pool } from '../config/database.js';
import { HttpError } from '../shared/http-error.js';

async function loadActiveUser(req: Request) {
  const sessionUser = req.session.user;
  if (!sessionUser) throw new HttpError(401, 'Authentication required.', 'AUTHENTICATION_REQUIRED');
  const result = await pool.query(
    `SELECT u.id, u.email, u.full_name, CASE WHEN oc.owner_user_id IS NOT NULL THEN 'owner' ELSE u.role::text END AS role, u.account_status, u.identity_verification_status FROM users u LEFT JOIN owner_configuration oc ON oc.owner_user_id=u.id WHERE u.id = $1 LIMIT 1`, [sessionUser.id]
  );
  const user = result.rows[0];
  if (!user || user.account_status !== 'active') {
    await new Promise<void>((resolve) => req.session.destroy(() => resolve()));
    throw new HttpError(401, 'This account is no longer active. Sign in again or contact NEXORA support.', 'ACCOUNT_NOT_ACTIVE');
  }
  req.session.user = { id: user.id, email: user.email, fullName: user.full_name, role: user.role,
    accountStatus: user.account_status, identityVerificationStatus: user.identity_verification_status };
  return req.session.user;
}
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try { await loadActiveUser(req); next(); } catch (error) { next(error); }
}
export function requireRoles(...roles: string[]) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try { const user = await loadActiveUser(req); if (!roles.includes(user.role)) throw new HttpError(403, 'You do not have permission to access this resource.', 'INSUFFICIENT_ROLE'); next(); }
    catch (error) { next(error); }
  };
}
export function requireAdministrator() {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try { const user = await loadActiveUser(req); if (!['owner','admin'].includes(user.role)) throw new HttpError(403, 'Administrator access required.', 'ADMINISTRATOR_ACCESS_REQUIRED'); next(); }
    catch (error) { next(error); }
  };
}
export function requirePermission(permission: string) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const user = await loadActiveUser(req);
      if (user.role === 'owner') return next();
      if (user.role !== 'admin') throw new HttpError(403, 'Administrator access required.', 'ADMINISTRATOR_ACCESS_REQUIRED');
      const grant = await pool.query(
        `SELECT 1 FROM administrator_permission_grants WHERE administrator_user_id=$1 AND permission_code=$2 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())`,
        [user.id, permission]
      );
      if (!grant.rowCount) throw new HttpError(403, `Missing required permission: ${permission}.`, 'INSUFFICIENT_PERMISSION');
      next();
    } catch (error) { next(error); }
  };
}
