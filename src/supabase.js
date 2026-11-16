import { createClient } from '@supabase/supabase-js';
import { markQuotaWait } from './quota-service';

const url = import.meta.env.VITE_SUPABASE_URL || 'https://fgantnnxzeekjddfgbgf.supabase.co';
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_gn8Bitf1xxCxOL49FgrfdA_glg5msRD';

async function quotaAwareFetch(input, init) {
  const response = await fetch(input, init);
  if (response.status === 402) {
    const body = await response.clone().text().catch(()=>'');
    if (/exceed[_-]egress[_-]quota|service for this project is restricted/i.test(body)) markQuotaWait();
  }
  return response;
}
export const isSupabaseConfigured = Boolean(url && key);
export const supabase = isSupabaseConfigured
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }, global: {fetch:quotaAwareFetch} })
  : null;

export function requireSupabase() {
  if (!supabase) throw new Error('Supabase belum dikonfigurasi. Isi VITE_SUPABASE_URL dan VITE_SUPABASE_PUBLISHABLE_KEY.');
  return supabase;
}
