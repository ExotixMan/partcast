import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';

export const adminDb = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

export function userDb(accessToken) {
  return createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
}
