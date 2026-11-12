import { Router } from 'express';
import crypto from 'node:crypto';
import { pool } from '../../config/database.js';
import { requireRoles } from '../../middleware/authenticate.js';
import { HttpError } from '../../shared/http-error.js';

export const ownerRouter = Router();
ownerRouter.use(requireRoles('owner'));
const catalog = ['applications.read','applications.review','applications.decide','users.read','users.manage_status','users.verify_identity','audit.read'];
ownerRouter.get('/administrators', async (_req,res,next)=>{
 try { const r=await pool.query(`SELECT u.id,u.email,u.full_name,u.account_status,u.created_at,
  COALESCE(json_agg(json_build_object('permission',g.permission_code,'grantedAt',g.granted_at,'expiresAt',g.expires_at)) FILTER(WHERE g.id IS NOT NULL AND g.revoked_at IS NULL),'[]') permissions
  FROM users u LEFT JOIN administrator_permission_grants g ON g.administrator_user_id=u.id AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at>now())
  WHERE u.role='admin' GROUP BY u.id ORDER BY u.created_at DESC`); res.json({administrators:r.rows,availablePermissions:catalog}); } catch(e){next(e);}
});
ownerRouter.post('/administrators/invitations', async (req,res,next)=>{
 try {
  const email=String(req.body?.email||'').trim().toLowerCase(), fullName=String(req.body?.fullName||'').trim();
  const permissions=req.body?.permissions;
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||fullName.length<2||fullName.length>160||!Array.isArray(permissions)||permissions.some((p:string)=>!catalog.includes(p))) throw new HttpError(422,'Provide a valid email, full name and permitted permission list.','INVALID_ADMIN_INVITATION');
  const exists=await pool.query('SELECT 1 FROM users WHERE lower(email)=lower($1)',[email]); if(exists.rowCount) throw new HttpError(409,'An account already exists for this email.','ACCOUNT_EXISTS');
  const token=crypto.randomBytes(32).toString('hex'), hash=crypto.createHash('sha256').update(token).digest('hex');
  const result=await pool.query(`INSERT INTO administrator_invitations(email,full_name,token_hash,invited_by_user_id,expires_at,initial_permissions)
   VALUES($1,$2,$3,$4,now()+interval '72 hours',$5::jsonb) RETURNING id,expires_at`,[email,fullName,hash,req.session.user!.id,JSON.stringify([...new Set(permissions)])]);
  await pool.query(`INSERT INTO audit_logs(actor_user_id,action,target_type,target_id,metadata) VALUES($1,'ADMIN_INVITATION_CREATED','administrator_invitation',$2,jsonb_build_object('email',$3,'permissions',$4))`,[req.session.user!.id,result.rows[0].id,email,permissions]);
  // Token is returned once for secure out-of-band delivery by the Owner; never stored in plaintext.
  res.status(201).json({invitation:{id:result.rows[0].id,email,fullName,expiresAt:result.rows[0].expires_at,acceptanceToken:token,initialPermissions:permissions}});
 }catch(e){next(e);}
});
ownerRouter.patch('/administrators/:id/permissions', async(req,res,next)=>{
 const db=await pool.connect(); try{
  const permissions=req.body?.permissions;
  if(!Array.isArray(permissions)||permissions.some((p:string)=>!catalog.includes(p))) throw new HttpError(422,'Permissions must be selected from the published permission catalogue.','INVALID_PERMISSIONS');
  await db.query('BEGIN');
  const target=await db.query("SELECT id,role FROM users WHERE id=$1 FOR UPDATE",[req.params.id]);
  if(!target.rowCount||target.rows[0].role!=='admin') throw new HttpError(404,'Delegated administrator not found.','ADMINISTRATOR_NOT_FOUND');
  await db.query(`UPDATE administrator_permission_grants SET revoked_at=now(),revoked_by_user_id=$2 WHERE administrator_user_id=$1 AND revoked_at IS NULL`,[req.params.id,req.session.user!.id]);
  for(const permission of [...new Set(permissions)]) await db.query(`INSERT INTO administrator_permission_grants(administrator_user_id,permission_code,granted_by_user_id) VALUES($1,$2,$3) ON CONFLICT(administrator_user_id,permission_code) DO UPDATE SET granted_by_user_id=EXCLUDED.granted_by_user_id,granted_at=now(),revoked_at=NULL,revoked_by_user_id=NULL,expires_at=NULL`,[req.params.id,permission,req.session.user!.id]);
  await db.query(`INSERT INTO audit_logs(actor_user_id,action,target_type,target_id,metadata) VALUES($1,'ADMIN_PERMISSIONS_REPLACED','user',$2,jsonb_build_object('permissions',$3))`,[req.session.user!.id,req.params.id,permissions]);
  await db.query('COMMIT'); res.json({administratorId:req.params.id,permissions});
 }catch(e){await db.query('ROLLBACK').catch(()=>undefined);next(e);}finally{db.release();}
});
ownerRouter.patch('/administrators/:id/account-status', async(req,res,next)=>{
 try{const status=req.body?.status;if(!['active','suspended','disabled'].includes(status))throw new HttpError(422,'Invalid administrator status.','INVALID_ACCOUNT_STATUS');
 const r=await pool.query("UPDATE users SET account_status=$1,updated_at=now() WHERE id=$2 AND role='admin' RETURNING id,email,account_status",[status,req.params.id]);
 if(!r.rowCount)throw new HttpError(404,'Delegated administrator not found.','ADMINISTRATOR_NOT_FOUND');
 if(status!=='active')await pool.query('DELETE FROM user_sessions WHERE sess::text LIKE $1',[`%${req.params.id}%`]);
 await pool.query(`INSERT INTO audit_logs(actor_user_id,action,target_type,target_id,metadata) VALUES($1,'ADMIN_ACCOUNT_STATUS_CHANGED','user',$2,jsonb_build_object('status',$3))`,[req.session.user!.id,req.params.id,status]);res.json({administrator:r.rows[0]});
 }catch(e){next(e);}
});
