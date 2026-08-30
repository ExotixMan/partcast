import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anon) console.warn('Missing Supabase frontend environment variables.');

export const supabase = createClient(url || 'https://example.supabase.co', anon || 'missing-anon-key', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});
