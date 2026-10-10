import 'dotenv/config';
import { z } from 'zod';
import { supabaseKeyIssue, frontendOrigins } from './utils/connection-config.js';

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().int().positive().default(10000),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  FRONTEND_ORIGINS: z.string().default('http://localhost:5173'),
  SETUP_SECRET: z.string().min(16),
  CRON_SECRET: z.string().min(24),
  IP_HASH_SECRET: z.string().min(16),
  GMAIL_CLIENT_ID: z.string().default(''),
  GMAIL_CLIENT_SECRET: z.string().default(''),
  GMAIL_REFRESH_TOKEN: z.string().default(''),
  GMAIL_SENDER_EMAIL: z.string().email().optional().or(z.literal('')).default(''),
  INTEGRATION_ENCRYPTION_KEY: z.string().min(32).optional(),
  GEMINI_API_KEY: z.string().optional().default(''),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
  PYTHON_BIN: z.string().default('python3'),
  ML_SCRIPT_PATH: z.string().default('../../ml/train_forecast.py'),
  BACKUP_RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(30)
}).superRefine((values, ctx) => {
  for (const [field, role] of [['SUPABASE_ANON_KEY', 'anon'], ['SUPABASE_SERVICE_ROLE_KEY', 'service_role']]) {
    const issue = supabaseKeyIssue(values.SUPABASE_URL, values[field], role);
    if (issue) ctx.addIssue({ code: 'custom', path: [field], message: issue });
  }
  try { frontendOrigins(values.FRONTEND_ORIGINS); }
  catch { ctx.addIssue({ code: 'custom', path: ['FRONTEND_ORIGINS'], message: 'Use comma-separated HTTP or HTTPS website addresses.' }); }
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = {
  ...parsed.data,
  frontendOrigins: frontendOrigins(parsed.data.FRONTEND_ORIGINS)
};
