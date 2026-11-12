import { Router } from 'express';
import { pool } from '../../config/database.js';
import { requireAdministrator, requirePermission } from '../../middleware/authenticate.js';
import { HttpError } from '../../shared/http-error.js';

export const adminRouter = Router();
adminRouter.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
adminRouter.use(requireAdministrator());
const allowedStatuses = ['Under Review', 'More Information Required', 'On Hold', 'Approved', 'Rejected'] as const;
const applicantMessages: Record<string, string> = {
  'Under Review': 'Your application is being reviewed by NEXORA.',
  'More Information Required': 'NEXORA needs additional information. Please contact the agency through its official contact channel.',
  'On Hold': 'Your application review is temporarily on hold. NEXORA will provide an update when review resumes.',
  'Approved': 'Your application has been approved. You may proceed to account registration using your application reference.',
  'Rejected': 'Your application was not approved. Contact NEXORA through its official contact channel if you need clarification.'
};


adminRouter.get('/applications', requirePermission('applications.read'), async (req, res, next) => {
  try {
    const page = Math.max(1, Math.min(10000, Number.parseInt(String(req.query.page || '1'), 10) || 1));
    const limit = Math.max(1, Math.min(50, Number.parseInt(String(req.query.limit || '20'), 10) || 20));
    const requestedStatus = typeof req.query.status === 'string' ? req.query.status : 'all';
    const knownStatuses = ['Submitted','Under Review','More Information Required','On Hold','Approved','Rejected','Withdrawn'];
    if (requestedStatus !== 'all' && !knownStatuses.includes(requestedStatus)) throw new HttpError(422, 'Invalid application status filter.', 'INVALID_STATUS_FILTER');
    const status = requestedStatus === 'all' ? null : requestedStatus;
    const type = typeof req.query.type === 'string' && ['client','designer'].includes(req.query.type) ? req.query.type : null;
    const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '';
    const values: unknown[] = [];
    const clauses: string[] = [];
    if (status) { values.push(status); clauses.push(`status = $${values.length}`); }
    if (type) { values.push(type); clauses.push(`application_type = $${values.length}`); }
    if (search) { values.push(`%${search}%`); clauses.push(`(reference ILIKE $${values.length} OR applicant_email ILIKE $${values.length} OR application_data::text ILIKE $${values.length})`); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const count = await pool.query(`SELECT count(*)::int AS total FROM applications ${where}`, values);
    values.push(limit, (page - 1) * limit);
    const rows = await pool.query(
      `SELECT id, reference, application_type, applicant_email, status, application_data, submitted_at, updated_at, decided_at
       FROM applications ${where} ORDER BY submitted_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`, values
    );
    res.json({ applications: rows.rows, pagination: { page, limit, total: count.rows[0].total, pages: Math.ceil(count.rows[0].total / limit) } });
  } catch (error) { next(error); }
});

adminRouter.get('/applications/:reference', requirePermission('applications.read'), async (req, res, next) => {
  try {
    const found = await pool.query(
      `SELECT id, reference, application_type, applicant_email, status, application_data, submitted_at, updated_at, decided_at, assigned_reviewer_user_id
       FROM applications WHERE upper(reference) = upper($1) LIMIT 1`, [req.params.reference]
    );
    const application = found.rows[0];
    if (!application) throw new HttpError(404, 'Application not found.', 'APPLICATION_NOT_FOUND');
    const history = await pool.query(
      `SELECT h.from_status, h.to_status, h.note, h.internal_note, h.created_at, u.full_name AS actor_name
       FROM application_status_history h LEFT JOIN users u ON u.id = h.actor_user_id
       WHERE h.application_id = $1 ORDER BY h.created_at ASC`, [application.id]
    );
    res.json({ application, history: history.rows });
  } catch (error) { next(error); }
});

adminRouter.post('/applications/:reference/decision', requirePermission('applications.decide'), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { reference } = req.params;
    const status = req.body?.status;
    const note = typeof req.body?.note === 'string' ? req.body.note.trim() : '';
    if (!allowedStatuses.includes(status)) throw new HttpError(422, 'Unsupported application decision.', 'INVALID_APPLICATION_STATUS');
    if (note.length < 5 || note.length > 1200) throw new HttpError(422, 'A review note between 5 and 1,200 characters is required.', 'INVALID_REVIEW_NOTE');
    await client.query('BEGIN');
    const found = await client.query('SELECT id, status FROM applications WHERE upper(reference) = upper($1) FOR UPDATE', [reference]);
    const application = found.rows[0];
    if (!application) throw new HttpError(404, 'Application not found.', 'APPLICATION_NOT_FOUND');
    if (['Approved', 'Rejected', 'Withdrawn'].includes(application.status)) throw new HttpError(409, 'This application has already reached a terminal status.', 'APPLICATION_ALREADY_DECIDED');
    await client.query(
      `UPDATE applications SET status = $1, assigned_reviewer_user_id = $2, updated_at = now(),
       decided_at = CASE WHEN $1 IN ('Approved', 'Rejected') THEN now() ELSE decided_at END WHERE id = $3`,
      [status, req.session.user!.id, application.id]
    );
    await client.query(
      `INSERT INTO application_status_history (application_id, from_status, to_status, actor_user_id, actor_kind, note, internal_note)
       VALUES ($1, $2, $3, $4, 'administrator', $5, $6)`,
      [application.id, application.status, status, req.session.user!.id, applicantMessages[status], note]
    );
    await client.query(
      `INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, metadata)
       VALUES ($1, 'APPLICATION_STATUS_CHANGED', 'application', $2, jsonb_build_object('from', $3, 'to', $4, 'note', $5))`,
      [req.session.user!.id, application.id, application.status, status, note]
    );
    await client.query('COMMIT');
    res.json({ reference, previousStatus: application.status, status });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    next(error);
  } finally { client.release(); }
});


adminRouter.get('/users', requirePermission('users.read'), async (_req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, email, full_name, role, account_status, identity_verification_status, created_at, last_login_at
       FROM users ORDER BY created_at DESC LIMIT 200`
    );
    res.json({ users: result.rows });
  } catch (error) { next(error); }
});

adminRouter.patch('/users/:id/account-status', requirePermission('users.manage_status'), async (req, res, next) => {
  try {
    const status = req.body?.status;
    if (!['active', 'suspended', 'disabled'].includes(status)) throw new HttpError(422, 'Account status must be active, suspended or disabled.', 'INVALID_ACCOUNT_STATUS');
    if (req.params.id === req.session.user!.id && status !== 'active') throw new HttpError(409, 'An administrator cannot suspend or disable their own account through this endpoint.', 'SELF_LOCKOUT_PREVENTED');
    const target = await pool.query('SELECT role FROM users WHERE id=$1', [req.params.id]);
    if (!target.rowCount) throw new HttpError(404, 'User account not found.', 'USER_NOT_FOUND');
    if (['owner','admin'].includes(target.rows[0].role)) throw new HttpError(403, 'Delegated administrators cannot manage Owner or administrator accounts.', 'PROTECTED_ADMIN_ACCOUNT');
    const result = await pool.query(
      `UPDATE users SET account_status = $1, updated_at = now() WHERE id = $2
       RETURNING id, email, role, account_status`, [status, req.params.id]
    );
    if (!result.rowCount) throw new HttpError(404, 'User account not found.', 'USER_NOT_FOUND');
    await pool.query(
      `INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, metadata)
       VALUES ($1, 'ACCOUNT_STATUS_CHANGED', 'user', $2, jsonb_build_object('status', $3))`,
      [req.session.user!.id, req.params.id, status]
    );
    res.json({ user: result.rows[0] });
  } catch (error) { next(error); }
});

adminRouter.patch('/users/:id/identity-verification', requirePermission('users.verify_identity'), async (req, res, next) => {
  try {
    const status = req.body?.status;
    const note = typeof req.body?.note === 'string' ? req.body.note.trim() : '';
    if (!['unverified', 'pending', 'verified', 'rejected'].includes(status)) throw new HttpError(422, 'Invalid identity verification status.', 'INVALID_VERIFICATION_STATUS');
    if (note.length < 5 || note.length > 1200) throw new HttpError(422, 'A verification note between 5 and 1,200 characters is required.', 'INVALID_VERIFICATION_NOTE');
    const target = await pool.query('SELECT role FROM users WHERE id=$1', [req.params.id]);
    if (!target.rowCount) throw new HttpError(404, 'User account not found.', 'USER_NOT_FOUND');
    if (['owner','admin'].includes(target.rows[0].role)) throw new HttpError(403, 'Administrator identity records cannot be modified here.', 'PROTECTED_ADMIN_ACCOUNT');
    const result = await pool.query(
      `UPDATE users SET identity_verification_status = $1, updated_at = now() WHERE id = $2
       RETURNING id, email, role, account_status, identity_verification_status`, [status, req.params.id]
    );
    if (!result.rowCount) throw new HttpError(404, 'User account not found.', 'USER_NOT_FOUND');
    await pool.query(
      `INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, metadata)
       VALUES ($1, 'IDENTITY_VERIFICATION_STATUS_CHANGED', 'user', $2, jsonb_build_object('status', $3, 'note', $4))`,
      [req.session.user!.id, req.params.id, status, note]
    );
    res.json({ user: result.rows[0] });
  } catch (error) { next(error); }
});

adminRouter.get('/audit', requirePermission('audit.read'), async (req,res,next)=>{
 try {
  const limit=Math.max(1,Math.min(100,Number.parseInt(String(req.query.limit||'50'),10)||50));
  const rows=await pool.query(`SELECT a.id,a.actor_user_id,u.full_name AS actor_name,a.action,a.target_type,a.target_id,a.metadata,a.created_at
    FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_user_id ORDER BY a.created_at DESC LIMIT $1`,[limit]);
  res.json({events:rows.rows});
 }catch(e){next(e);}
});
