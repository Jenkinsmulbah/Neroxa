import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { pool } from '../../config/database.js';
import { HttpError } from '../../shared/http-error.js';

export const applicantApplicationsRouter = Router();
applicantApplicationsRouter.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
const submissionLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many application submissions from this network. Try again later.' } });
const trackingLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many tracking attempts. Try again later.' } });
const emailSchema = z.string().trim().email().max(254);
const fieldLimits: Record<string, number> = {
  applicantName: 120, fullName: 120, email: 254, phone: 40, preferredContact: 40, location: 160,
  businessName: 160, industry: 100, businessStage: 100, registrationStatus: 80, launchDate: 20,
  website: 500, businessDescription: 1800, targetAudience: 1000, publicLinks: 1000,
  brandStatus: 100, marketingChannels: 300, existingMaterials: 1000, goals: 1500,
  startTiming: 100, frequency: 100, budget: 80, decisionRole: 100, additionalContext: 1200,
  headline: 160, portfolioUrl: 500, portfolioLinks: 1800, bio: 1800, description: 1800,
  experienceLevel: 100, education: 1000, tools: 1000, projectExamples: 1500, availability: 100,
  weeklyHours: 80, equipment: 120, startDate: 20, workflow: 1200, reliability: 1000,
  additionalInformation: 1000
};
const allowedKeys = new Set([...Object.keys(fieldLimits), 'services', 'specialties', 'originality', 'confidentiality', 'conduct', 'accuracyConfirmed', 'privacyAcknowledged']);
const requiredByType: Record<string, string[]> = {
  client: ['applicantName','email','phone','preferredContact','location','businessName','industry','businessStage','businessDescription','targetAudience','brandStatus','goals','startTiming','frequency','decisionRole','accuracyConfirmed','privacyAcknowledged'],
  designer: ['fullName','email','phone','location','bio','portfolioLinks','experienceLevel','tools','projectExamples','availability','weeklyHours','equipment','workflow','reliability','originality','confidentiality','conduct','accuracyConfirmed']
};
function cleanPayload(type: 'client'|'designer', input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(422, 'Application data must be an object.', 'INVALID_APPLICATION_DATA');
  const source = input as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (!allowedKeys.has(key)) continue;
    if (Array.isArray(value)) {
      if (value.length > 30 || value.some(v => typeof v !== 'string' || v.length > 160)) throw new HttpError(422, `Invalid values for ${key}.`, 'INVALID_APPLICATION_FIELD');
      data[key] = [...new Set(value.map(v => String(v).trim()).filter(Boolean))];
    } else if (typeof value === 'string') {
      const normalized = value.trim();
      if (normalized.length > (fieldLimits[key] || 20)) throw new HttpError(422, `${key} exceeds the allowed length.`, 'APPLICATION_FIELD_TOO_LONG');
      data[key] = normalized;
    } else if (typeof value === 'boolean') data[key] = value;
    else throw new HttpError(422, `Invalid value for ${key}.`, 'INVALID_APPLICATION_FIELD');
  }
  for (const key of (requiredByType[type] || [])) {
    const value = data[key];
    if (value === undefined || value === '' || value === false) throw new HttpError(422, `Required application field missing: ${key}.`, 'REQUIRED_APPLICATION_FIELD_MISSING');
  }
  const email = emailSchema.safeParse(data.email);
  if (!email.success) throw new HttpError(422, 'Enter a valid email address.', 'INVALID_EMAIL');
  data.email = email.data.toLowerCase();
  for (const key of ['website', 'portfolioUrl']) {
    const candidate = data[key];
    if (typeof candidate === 'string' && candidate) {
      try { const parsedUrl = new URL(candidate); if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error(); }
      catch { throw new HttpError(422, `${key} must be a valid HTTP or HTTPS URL.`, 'INVALID_APPLICATION_URL'); }
    }
  }
  const listKey = type === 'client' ? 'services' : 'specialties';
  if (!Array.isArray(data[listKey]) || !(data[listKey] as string[]).length) throw new HttpError(422, `Select at least one ${listKey === 'services' ? 'service' : 'specialization'}.`, 'APPLICATION_SELECTION_REQUIRED');
  if (type === 'client' && data.applicantName) data.applicantName = String(data.applicantName).trim();
  return data;
}
const makeReference = () => `NX-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
const hashAccess = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
function requireReference(value: string | string[] | undefined): string {
  const result = z.string()
    .regex(/^NX-[A-F0-9]{10}$/i)
    .safeParse(value);

  if (!result.success) {
    throw new HttpError(
      404,
      'Application not found or access details are incorrect.',
      'APPLICATION_NOT_FOUND'
    );
  }

  return result.data;
}

applicantApplicationsRouter.post('/', submissionLimiter, async (req, res, next) => {
  try {
    const parsed = z.object({ type: z.enum(['client','designer']), data: z.unknown() }).safeParse(req.body);
    if (!parsed.success) throw new HttpError(422, 'Choose a valid application type and provide application data.', 'INVALID_APPLICATION_REQUEST');
    const data = cleanPayload(parsed.data.type, parsed.data.data);
    const email = String(data.email);
    const duplicate = await pool.query(
      `SELECT reference FROM applications WHERE application_type = $1 AND lower(applicant_email) = $2
       AND status IN ('Submitted','Under Review','More Information Required','On Hold') LIMIT 1`, [parsed.data.type, email]
    );
    if (duplicate.rowCount) throw new HttpError(409, 'An active application of this type already exists for this email. Use the reference and access code from your earlier submission, or contact NEXORA if you no longer have them.', 'ACTIVE_APPLICATION_EXISTS');
    const reference = makeReference();
    const accessToken = crypto.randomBytes(32).toString('base64url');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const inserted = await client.query(
        `INSERT INTO applications (reference, application_type, applicant_email, status, application_data, applicant_access_token_hash)
         VALUES ($1, $2, $3, 'Submitted', $4::jsonb, $5) RETURNING id, reference, application_type, status, submitted_at`,
        [reference, parsed.data.type, email, JSON.stringify(data), hashAccess(accessToken)]
      );
      await client.query(
        `INSERT INTO application_status_history (application_id, from_status, to_status, actor_user_id, actor_kind, note)
         VALUES ($1, NULL, 'Submitted', NULL, 'applicant', 'Application received by NEXORA.')`, [inserted.rows[0].id]
      );
      await client.query(
        `INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, metadata)
         VALUES (NULL, 'APPLICATION_SUBMITTED', 'application', $1, jsonb_build_object('type', $2))`, [inserted.rows[0].id, parsed.data.type]
      );
      await client.query('COMMIT');
      res.status(201).json({ reference, accessToken, type: parsed.data.type, status: 'Submitted', submittedAt: inserted.rows[0].submitted_at,
        message: 'Application submitted. Save both the reference and access code; the access code is shown only once.' });
    } catch (error: any) { await client.query('ROLLBACK').catch(() => undefined); if (error?.code === '23505') throw new HttpError(409, 'An active application already exists for this email and application type.', 'ACTIVE_APPLICATION_EXISTS'); throw error; }
    finally { client.release(); }
  } catch (error) { next(error); }
});

applicantApplicationsRouter.post('/:reference/status', trackingLimiter, async (req, res, next) => {
  try {
    const reference = requireReference(req.params.reference);
    const parsed = z.object({ accessToken: z.string().min(30).max(100) }).safeParse(req.body);
    if (!parsed.success) throw new HttpError(422, 'A valid application access code is required.', 'ACCESS_CODE_REQUIRED');
    const result = await pool.query(
      `SELECT id, reference, application_type, status, submitted_at, updated_at, decided_at, applicant_access_token_hash
       FROM applications WHERE upper(reference) = upper($1) LIMIT 1`, [reference]
    );
    const application = result.rows[0];
    const supplied = hashAccess(parsed.data.accessToken);
    const stored = application?.applicant_access_token_hash || '0'.repeat(64);
    const valid = crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(stored));
    if (!application || !valid) throw new HttpError(404, 'Application not found or access details are incorrect.', 'APPLICATION_NOT_FOUND');
    const history = await pool.query(
      `SELECT to_status, note, created_at FROM application_status_history WHERE application_id = $1 ORDER BY created_at ASC`, [application.id]
    );
    res.json({ reference: application.reference, type: application.application_type, status: application.status,
      submittedAt: application.submitted_at, updatedAt: application.updated_at, decidedAt: application.decided_at,
      history: history.rows.map(row => ({ status: row.to_status, note: row.note, at: row.created_at })) });
  } catch (error) { next(error); }
});

applicantApplicationsRouter.post('/:reference/withdraw', trackingLimiter, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const reference = requireReference(req.params.reference);
    const parsed = z.object({ accessToken: z.string().min(30).max(100), note: z.string().trim().max(500).optional() }).safeParse(req.body);
    if (!parsed.success) throw new HttpError(422, 'Valid application access details are required.', 'INVALID_WITHDRAWAL_REQUEST');
    await client.query('BEGIN');
    const found = await client.query(`SELECT id, status, applicant_access_token_hash FROM applications WHERE upper(reference) = upper($1) FOR UPDATE`, [reference]);
    const app = found.rows[0];
    const supplied = hashAccess(parsed.data.accessToken);
    const stored = app?.applicant_access_token_hash || '0'.repeat(64);
    const valid = crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(stored));
    if (!app || !valid) throw new HttpError(404, 'Application not found or access details are incorrect.', 'APPLICATION_NOT_FOUND');
    if (['Approved','Rejected','Withdrawn'].includes(app.status)) throw new HttpError(409, 'This application can no longer be withdrawn.', 'APPLICATION_TERMINAL');
    await client.query(`UPDATE applications SET status='Withdrawn', updated_at=now(), decided_at=now() WHERE id=$1`, [app.id]);
    await client.query(`INSERT INTO application_status_history (application_id, from_status, to_status, actor_user_id, actor_kind, note) VALUES ($1,$2,'Withdrawn',NULL,'applicant',$3)`, [app.id, app.status, parsed.data.note || 'Applicant withdrew the application.']);
    await client.query(`INSERT INTO audit_logs (action,target_type,target_id,metadata) VALUES ('APPLICATION_WITHDRAWN','application',$1,'{}'::jsonb)`, [app.id]);
    await client.query('COMMIT');
    res.json({ reference: reference.toUpperCase(), status: 'Withdrawn' });
  } catch (error) { await client.query('ROLLBACK').catch(() => undefined); next(error); }
  finally { client.release(); }
});
