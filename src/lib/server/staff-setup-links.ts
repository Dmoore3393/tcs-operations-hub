import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isExistingAuthAccountError } from "@/lib/auth-email-errors";
import { isSupportedAccessRole } from "@/lib/team-access";

export const STAFF_SETUP_HOURS = 48;
export const SETUP_LINK_ERROR = "This setup link has expired or the account is already activated. Sign in if you finished setup, or request a new invitation.";
const lifetime = STAFF_SETUP_HOURS * 60 * 60 * 1000;
const digest = (token: string) => createHash("sha256").update(token).digest("hex");

export function publicAuthClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Secure staff setup is not configured.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

/** Only a digest is stored. The proof is delivered in the email's approved redirect URL. */
export async function issueStaffSetupLink(admin: SupabaseClient, organizationId: string, email: string, siteUrl: string, language?: string | null) {
  const token = randomBytes(32).toString("hex");
  const tokenHash = digest(token);
  const { error } = await admin.from("staff_setup_links").insert({
    token_hash: tokenHash, organization_id: organizationId, email: email.toLowerCase(),
    expires_at: new Date(Date.now() + lifetime).toISOString(),
  });
  if (error) throw error;
  const url = new URL("/staff-setup", siteUrl);
  url.searchParams.set("setup", token);
  if (language === "es") url.searchParams.set("lang", "es");
  return { tokenHash, redirectTo: url.toString() };
}

export async function activateStaffSetupLink(admin: SupabaseClient, tokenHash: string, userId: string) {
  // Start the full 48-hour window after sending and linking the existing employee.
  const { error } = await admin.from("staff_setup_links").update({
    auth_user_id: userId, ready_at: new Date().toISOString(), expires_at: new Date(Date.now() + lifetime).toISOString(),
  }).eq("token_hash", tokenHash).is("revoked_at", null);
  if (error) throw error;
}

export async function revokeStaffSetupLink(admin: SupabaseClient, tokenHash: string) {
  const { error } = await admin.from("staff_setup_links").update({ revoked_at: new Date().toISOString() }).eq("token_hash", tokenHash);
  if (error) throw error;
}

export async function readStaffSetupLink(admin: SupabaseClient, token: unknown) {
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) throw new Response(SETUP_LINK_ERROR, { status: 410 });
  const result = await admin.from("staff_setup_links").select("token_hash,organization_id,auth_user_id,email,expires_at,ready_at,revoked_at,last_exchange_at")
    .eq("token_hash", digest(token)).maybeSingle();
  if (result.error) throw result.error;
  const link = result.data;
  if (!link || link.revoked_at || Date.parse(link.expires_at) <= Date.now()) throw new Response(SETUP_LINK_ERROR, { status: 410 });
  if (!link.ready_at || !link.auth_user_id) throw new Response("Your invitation is still being prepared. Try again in a moment.", { status: 409 });
  const account = await admin.from("staff_access").select("user_id,organization_id,email,full_name,role,is_active,accepted_at")
    .eq("user_id", link.auth_user_id).eq("organization_id", link.organization_id).maybeSingle();
  if (account.error) throw account.error;
  const profile = account.data;
  if (!profile || !profile.is_active || profile.accepted_at || !isSupportedAccessRole(profile.role) || profile.email.toLowerCase() !== link.email) {
    throw new Response(SETUP_LINK_ERROR, { status: 410 });
  }
  return { link, profile };
}

/** Refreshes proof only after an explicit submit, never on email preview / GET. */
export async function exchangeStaffSetupLink(admin: SupabaseClient, token: unknown) {
  const { link, profile } = await readStaffSetupLink(admin, token);
  const now = new Date().toISOString();
  const claim = await admin.from("staff_setup_links").update({ last_exchange_at: now })
    .eq("token_hash", link.token_hash).is("revoked_at", null).gt("expires_at", now)
    .or(`last_exchange_at.is.null,last_exchange_at.lt.${new Date(Date.now() - 30000).toISOString()}`)
    .select("token_hash").maybeSingle();
  if (claim.error) throw claim.error;
  if (!claim.data) throw new Response("Please wait 30 seconds before trying your setup link again.", { status: 429 });

  // Never infer identity or access from editable user_metadata, or create another account.
  const identity = await admin.auth.admin.getUserById(profile.user_id);
  if (identity.error || identity.data.user?.email?.toLowerCase() !== link.email) throw new Response(SETUP_LINK_ERROR, { status: 410 });
  // Recovery generation cannot auto-create an account if the invited identity disappeared.
  const generated = await admin.auth.admin.generateLink({ type: "recovery", email: link.email });
  if (generated.error) throw generated.error;
  if (generated.data.user?.id !== profile.user_id) throw new Response(SETUP_LINK_ERROR, { status: 410 });
  const properties = generated.data.properties;
  if (properties.verification_type !== "recovery") throw new Error("The staff setup verification could not be completed.");
  const verified = await publicAuthClient().auth.verifyOtp({ token_hash: properties.hashed_token, type: properties.verification_type });
  if (verified.error) throw verified.error;
  if (!verified.data.session || verified.data.user?.id !== profile.user_id) throw new Response(SETUP_LINK_ERROR, { status: 410 });
  // Catch pause, email changes, or activation while the Auth request was in progress.
  await readStaffSetupLink(admin, token);
  return verified.data.session;
}

type PendingAccount = { user_id: string; organization_id: string; email: string; invited_at: string | null };

/** Shared by owner resends and the recipient's recovery form; one sender per account/minute. */
export async function sendPendingStaffSetup(admin: SupabaseClient, account: PendingAccount, siteUrl: string) {
  const now = new Date().toISOString();
  const reserved = await admin.from("staff_access").update({ invited_at: now })
    .eq("user_id", account.user_id).eq("organization_id", account.organization_id).eq("is_active", true).is("accepted_at", null)
    .or(`invited_at.is.null,invited_at.lt.${new Date(Date.now() - 60000).toISOString()}`)
    .select("user_id").maybeSingle();
  if (reserved.error) throw reserved.error;
  if (!reserved.data) throw new Response("A setup email was just requested. Please wait one minute and check your inbox and Spam.", { status: 429 });
  let issued: Awaited<ReturnType<typeof issueStaffSetupLink>> | undefined;
  try {
    issued = await issueStaffSetupLink(admin, account.organization_id, account.email, siteUrl);
    let sentAs = "invite";
    const sent = await admin.auth.admin.inviteUserByEmail(account.email, { redirectTo: issued.redirectTo });
    if (sent.error) {
      if (!isExistingAuthAccountError(sent.error)) throw sent.error;
      const recovery = await publicAuthClient().auth.resetPasswordForEmail(account.email, { redirectTo: issued.redirectTo });
      if (recovery.error) throw recovery.error;
      sentAs = "password setup";
    }
    await activateStaffSetupLink(admin, issued.tokenHash, account.user_id);
    return { sentAs, validForHours: STAFF_SETUP_HOURS };
  } catch (error) {
    if (issued) await revokeStaffSetupLink(admin, issued.tokenHash);
    await admin.from("staff_access").update({ invited_at: account.invited_at }).eq("user_id", account.user_id)
      .eq("organization_id", account.organization_id).eq("invited_at", now);
    throw error;
  }
}
