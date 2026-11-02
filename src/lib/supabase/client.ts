import { createClient } from "@supabase/supabase-js";
import { ensureNativeApiTransport } from "@/lib/native-api";

ensureNativeApiTransport();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseBrowserKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseAuthStorageKey = supabaseUrl
  ? `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`
  : "";

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseBrowserKey);

// The browser must only use a publishable key (or the legacy public anon key). Database access is protected
// by Supabase Auth and the row-level-security policies in supabase/setup.sql.
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseBrowserKey!, {
      auth: {
        storageKey: supabaseAuthStorageKey,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

/** Invitation password changes use verified tokens in memory, independent of Safari storage. */
export function createInvitationClient() {
  if (!supabaseUrl || !supabaseBrowserKey) throw new Error("Secure sign-in is not configured.");
  return createClient(supabaseUrl, supabaseBrowserKey, {
    auth: { storageKey: "tcs-invitation-memory", persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
