import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';
import { HttpError } from '../shared/http-error.js';

export function issueCsrfToken(req: Request, res: Response) {
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  res.json({ csrfToken: req.session.csrfToken });
}

export function protectStateChanges(req: Request, _res: Response, next: NextFunction) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (origin && origin !== env.FRONTEND_ORIGIN) return next(new HttpError(403, 'Request origin is not allowed.', 'INVALID_ORIGIN'));
  const supplied = req.get('x-csrf-token');
  const expected = req.session.csrfToken;
  if (!supplied || !expected || supplied.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
    return next(new HttpError(403, 'A valid CSRF token is required.', 'CSRF_VALIDATION_FAILED'));
  }
  next();
}
