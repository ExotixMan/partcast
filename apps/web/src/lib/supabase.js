import { createClient } from '@supabase/supabase-js';
import { supabaseConnectionIssue } from './connection.js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const storeConnectionIssue = supabaseConnectionIssue(url, anon);
export const storeConfigured = !storeConnectionIssue;

if (!url || !anon) console.warn('Missing Supabase frontend environment variables.');

export const authStorageKey = `sb-${new URL(storeConfigured ? url : 'https://example.supabase.co').hostname.split('.')[0]}-auth-token`;
export const supabase = createClient(storeConfigured ? url : 'https://example.supabase.co', storeConfigured ? anon : 'missing-anon-key', {
  auth: { persistSession: true, storageKey: authStorageKey, autoRefreshToken: true, detectSessionInUrl: true }
});
