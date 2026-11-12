import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { pool } from '../../config/database.js';
import rateLimit from 'express-rate-limit';
import { loginSchema, registerSchema } from './auth.schemas.js';
import { authenticate, recordLogin, registerFromApprovedApplication } from './auth.service.js';
import { requireAuth } from '../../middleware/authenticate.js';
import { HttpError } from '../../shared/http-error.js';

export const authRouter = Router();
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many authentication attempts. Try again later.' } });

function parse<T>(schema: { safeParse: (data: unknown) => any }, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) throw new HttpError(422, result.error.issues.map((issue: any) => issue.message).join(' '), 'VALIDATION_FAILED');
  return result.data as T;
}


authRouter.post('/accept-administrator-invitation', authLimiter, async (req,res,next)=>{
 try {
  const token=String(req.body?.token||''), password=String(req.body?.password||'');
  if(!/^[a-f0-9]{64}$/i.test(token)||password.length<12||password.length>128) throw new HttpError(422,'A valid invitation token and password of at least 12 characters are required.','INVALID_INVITATION_INPUT');
  const hash=crypto.createHash('sha256').update(token).digest('hex'); const db=await pool.connect();
  try {
   await db.query('BEGIN');
   const found=await db.query(`SELECT * FROM administrator_invitations WHERE token_hash=$1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now() FOR UPDATE`,[hash]);
   const invitation=found.rows[0]; if(!invitation) throw new HttpError(400,'This administrator invitation is invalid, expired or already used.','INVITATION_INVALID');
   const passwordHash=await bcrypt.hash(password,12);
   const created=await db.query(`INSERT INTO users(email,full_name,password_hash,role,account_status,identity_verification_status) VALUES(lower($1),$2,$3,'admin','active','unverified') RETURNING id,email,full_name,role,account_status,identity_verification_status`,[invitation.email,invitation.full_name,passwordHash]);
   for(const permission of invitation.initial_permissions) await db.query(`INSERT INTO administrator_permission_grants(administrator_user_id,permission_code,granted_by_user_id) VALUES($1,$2,$3)`,[created.rows[0].id,permission,invitation.invited_by_user_id]);
   await db.query('UPDATE administrator_invitations SET accepted_at=now() WHERE id=$1',[invitation.id]);
   await db.query(`INSERT INTO audit_logs(actor_user_id,action,target_type,target_id,metadata) VALUES($1,'ADMIN_INVITATION_ACCEPTED','user',$1,jsonb_build_object('invitationId',$2))`,[created.rows[0].id,invitation.id]);
   await db.query('COMMIT'); res.status(201).json({message:'Administrator account created. Sign in to continue.'});
  }catch(e){await db.query('ROLLBACK').catch(()=>undefined);throw e;}finally{db.release();}
 }catch(error){next(error);}
});

authRouter.post('/register', authLimiter, async (req, res, next) => {
  try {
    const data = parse<{ applicationReference: string; email: string; password: string }>(registerSchema, req.body);
    const user = await registerFromApprovedApplication(data.applicationReference, data.email, data.password);
    req.session.regenerate((error) => {
      if (error) return next(error);
      req.session.user = user;
      req.session.csrfToken = undefined;
      req.session.save((saveError) => saveError ? next(saveError) : res.status(201).json({ user }));
    });
  } catch (error) { next(error); }
});

authRouter.post('/login', authLimiter, async (req, res, next) => {
  try {
    const data = parse<{ email: string; password: string }>(loginSchema, req.body);
    const user = await authenticate(data.email, data.password);
    await recordLogin(user.id, { ip: req.ip, userAgent: req.get('user-agent') });
    req.session.regenerate((error) => {
      if (error) return next(error);
      req.session.user = user;
      req.session.save((saveError) => saveError ? next(saveError) : res.json({ user }));
    });
  } catch (error) { next(error); }
});

authRouter.post('/logout', (req, res, next) => {
  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie('nexora.sid', { httpOnly: true, secure: process.env.COOKIE_SECURE === 'true', sameSite: 'lax', path: '/' });
    res.status(204).end();
  });
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.session.user });
});
