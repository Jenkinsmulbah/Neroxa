import express from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { pool } from './config/database.js';
import { issueCsrfToken, protectStateChanges } from './middleware/csrf.js';
import { requireAuth, requireRoles } from './middleware/authenticate.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { ownerRouter } from './modules/auth/owner.routes.js';
import { adminRouter } from './modules/applications/admin.routes.js';
import { applicantApplicationsRouter } from './modules/applications/applicant.routes.js';
import { HttpError } from './shared/http-error.js';

const app = express();
const PgSession = connectPgSimple(session);
if (env.TRUST_PROXY === 'true') app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'data:', 'https:'], connectSrc: ["'self'", env.FRONTEND_ORIGIN], objectSrc: ["'none'"], frameAncestors: ["'none'"] } } }));
app.use(cors({ origin: env.FRONTEND_ORIGIN, credentials: true, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], allowedHeaders: ['Content-Type', 'X-CSRF-Token'] }));
app.use(express.json({ limit: '1mb' }));
app.use(session({
  name: 'nexora.sid',
  store: new PgSession({ pool, tableName: 'user_sessions', createTableIfMissing: false, pruneSessionInterval: 15 * 60 }),
  secret: env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: { httpOnly: true, secure: env.COOKIE_SECURE === 'true', sameSite: 'lax', path: '/', maxAge: env.SESSION_MAX_AGE_HOURS * 60 * 60 * 1000 }
}));
app.use(protectStateChanges);
app.use('/api', rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false }));
app.get('/api/health', async (_req, res, next) => {
  try { await pool.query('SELECT 1'); res.json({ status: 'ok', service: 'nexora-api', database: 'connected' }); }
  catch (error) { next(error); }
});
app.get('/api/auth/csrf', issueCsrfToken);
app.use('/api/auth', authRouter);
app.use('/api/applications', applicantApplicationsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/owner', ownerRouter);
app.get('/api/client/overview', requireAuth, requireRoles('client', 'admin', 'owner'), (_req, res) => res.json({ message: 'Authenticated client API boundary. Client data endpoints are introduced in later phases.' }));
app.get('/api/team/overview', requireAuth, requireRoles('designer', 'admin', 'owner'), (_req, res) => res.json({ message: 'Authenticated designer API boundary. Assignment endpoints are introduced in later phases.' }));
app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = error instanceof HttpError ? error.status : 500;
  if (status >= 500) console.error(error);
  res.status(status).json({ error: status === 500 ? 'An unexpected server error occurred.' : error.message, code: error instanceof HttpError ? error.code : 'INTERNAL_ERROR' });
});
export default app;
