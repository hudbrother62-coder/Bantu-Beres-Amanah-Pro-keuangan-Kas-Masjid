import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(url && key);
export const supabase = isSupabaseConfigured
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null;

export function requireSupabase() {
  if (!supabase) throw new Error('Supabase belum dikonfigurasi. Isi VITE_SUPABASE_URL dan VITE_SUPABASE_PUBLISHABLE_KEY.');
  return supabase;
}
