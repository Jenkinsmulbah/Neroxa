import { z } from 'zod';

export const registerSchema = z.object({
  applicationReference: z.string().trim().regex(/^NX-[A-F0-9]{8}$/i),
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(128).regex(/[a-z]/, 'Password must contain a lowercase letter.').regex(/[A-Z]/, 'Password must contain an uppercase letter.').regex(/[0-9]/, 'Password must contain a number.').regex(/[^A-Za-z0-9]/, 'Password must contain a symbol.')
});
export const loginSchema = z.object({ email: z.string().trim().email().max(254), password: z.string().min(1).max(128) });
