import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const storeConfigured = Boolean(url && anon);

if (!url || !anon) console.warn('Missing Supabase frontend environment variables.');

export const authStorageKey = `sb-${new URL(url || 'https://example.supabase.co').hostname.split('.')[0]}-auth-token`;
export const supabase = createClient(url || 'https://example.supabase.co', anon || 'missing-anon-key', {
  auth: { persistSession: true, storageKey: authStorageKey, autoRefreshToken: true, detectSessionInUrl: true }
});
