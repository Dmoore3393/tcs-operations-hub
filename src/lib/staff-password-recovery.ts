import type { SupabaseClient } from "@supabase/supabase-js";

// Always return email links to the live, allowlisted web page, including from the native app.
export const STAFF_PASSWORD_RESET_REDIRECT = "https://tcs-operations-hub.vercel.app/password-recovery";

export type RecoveryProof =
  | { kind: "hash"; token: string }
  | { kind: "session"; access_token: string; refresh_token: string }
  | { kind: "invalid" };

export function readRecoveryProof(fragment: string): RecoveryProof {
  const hash = new URLSearchParams(fragment.replace(/^#/, ""));
  if (hash.has("error") || hash.get("type") !== "recovery") return { kind: "invalid" };
  const token = hash.get("token_hash") || "";
  if (/^[A-Za-z0-9_-]{20,256}$/.test(token)) return { kind: "hash", token };
  const access_token = hash.get("access_token"), refresh_token = hash.get("refresh_token");
  if (access_token && refresh_token) return { kind: "session", access_token, refresh_token };
  return { kind: "invalid" };
}

export async function verifyRecoveryProof(client: SupabaseClient, proof: RecoveryProof) {
  if (proof.kind === "invalid") throw new Error("Request a new password reset link.");
  const result = proof.kind === "hash"
    ? await client.auth.verifyOtp({ type: "recovery", token_hash: proof.token })
    : await client.auth.setSession({ access_token: proof.access_token, refresh_token: proof.refresh_token });
  if (result.error) throw result.error;
  if (!result.data.user || !result.data.session) throw new Error("This link cannot be verified.");
}

export async function requestStaffPasswordReset(client: SupabaseClient, email: string) {
  const normalized = email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(normalized)) throw new Error("Enter your staff email address.");
  const { error } = await client.auth.resetPasswordForEmail(normalized, { redirectTo: STAFF_PASSWORD_RESET_REDIRECT });
  if (error) throw error;
}
