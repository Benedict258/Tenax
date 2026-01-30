import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseClient = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    })
  : null;

export async function setSupabaseSession(session: any) {
  if (!supabaseClient || !session) return;
  try {
    await supabaseClient.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token
    });
  } catch (error) {
    console.warn('Failed to set Supabase session', error);
  }
}
