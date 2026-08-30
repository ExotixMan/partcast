import 'dotenv/config';
import { z } from 'zod';

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
  BREVO_API_KEY: z.string().optional().default(''),
  BREVO_SENDER_EMAIL: z.string().email().optional().or(z.literal('')).default(''),
  BREVO_SENDER_NAME: z.string().default('NPG Autoparts - PartCast'),
  GEMINI_API_KEY: z.string().optional().default(''),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
  PYTHON_BIN: z.string().default('python3'),
  ML_SCRIPT_PATH: z.string().default('../../ml/train_forecast.py'),
  BACKUP_RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(30)
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = {
  ...parsed.data,
  frontendOrigins: parsed.data.FRONTEND_ORIGINS.split(',').map(v => v.trim()).filter(Boolean)
};
