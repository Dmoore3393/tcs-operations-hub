import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseBrowserKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseBrowserKey);

// The browser must only use a publishable key (or the legacy public anon key). Database access is protected
// by Supabase Auth and the row-level-security policies in supabase/setup.sql.
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseBrowserKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
