import { z } from 'zod';

export const userSchema = z.object({
  id: z.string().uuid(),
  org_id: z.string().uuid(),
  username: z.string(),
  name: z.string(),
  role: z.enum(['admin', 'security_expert', 'operator', 'auditor']),
  is_active: z.boolean(),
  is_digital_human: z.boolean(),
});

export type AuthUser = z.infer<typeof userSchema>;

export const loginResponseSchema = z.object({
  success: z.literal(true),
  token: z.string(),
  token_type: z.string(),
  expires_in: z.number(),
  user: userSchema,
});

export const emptyEnvelopeSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  data: z.null(),
});
