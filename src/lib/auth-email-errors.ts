/** These helpers are used only by email-sending flows. */
export const AUTH_EMAIL_LIMIT_MESSAGE = "Email sending is temporarily paused because The Hub reached its email limit. Check the inbox and Spam for the newest setup email. Wait before requesting another. If this continues, contact Danielle or Jennifer.";
type AuthError = { code?: string; message?: string; status?: number };
function details(error: unknown): AuthError { return error && typeof error === "object" ? error as AuthError : {}; }
export function isAuthEmailRateLimit(error: unknown) {
  const value = details(error);
  return ["over_email_send_rate_limit", "over_request_rate_limit"].includes(value.code || "") || value.status === 429 || /email.*rate.*limit|rate.*limit.*email|security purposes.*seconds/i.test(value.message || "");
}
export function authEmailErrorMessage(error: unknown, fallback = "The setup email could not be sent. Please try again later.") {
  return isAuthEmailRateLimit(error) ? AUTH_EMAIL_LIMIT_MESSAGE : details(error).message || fallback;
}
export function isExistingAuthAccountError(error: unknown) {
  const value = details(error);
  return !isAuthEmailRateLimit(error) && (["email_exists", "user_already_exists"].includes(value.code || "") || /already (?:been )?registered|user already exists/i.test(value.message || ""));
}
export function authEmailLimitResponse(error: unknown): Response | null {
  // Supabase does not return a reliable time for the project quota to refill.
  return isAuthEmailRateLimit(error) ? Response.json({ error: AUTH_EMAIL_LIMIT_MESSAGE, code: "email_rate_limited" }, { status: 429, headers: { "Cache-Control": "no-store" } }) : null;
}
