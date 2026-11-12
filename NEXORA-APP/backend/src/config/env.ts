import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  FRONTEND_ORIGIN: z.string().url(),
  COOKIE_SECURE: z.enum(['true', 'false']).default('false'),
  TRUST_PROXY: z.enum(['true', 'false']).default('false'),
  SESSION_MAX_AGE_HOURS: z.coerce.number().int().min(1).max(168).default(12)
}).superRefine((value, ctx) => {
  if (value.NODE_ENV === 'production' && value.COOKIE_SECURE !== 'true') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['COOKIE_SECURE'], message: 'COOKIE_SECURE must be true in production.' });
  }
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid backend environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}
export const env = parsed.data;
