import { readAccessCheck } from "@/lib/access-check";
import { withRequestTimeout } from "@/lib/request-timeout";

/** Allow a cold server to verify access; bound both headers and body together. */
export function requestStaffProfile<T>(token: string, timeoutMs = 30_000): Promise<{ profile: T }> {
  return withRequestTimeout(async signal => {
    const response = await fetch("/api/auth/profile", {
      method: "POST",
      cache: "no-store",
      signal,
      headers: { Accept: "application/json", Authorization: `Bearer ${token}`, "Cache-Control": "no-cache" },
    });
    return readAccessCheck<{ profile: T }>(response, "Staff access check", data => Boolean(
      data.profile && typeof data.profile === "object" &&
      "user_id" in data.profile && typeof data.profile.user_id === "string"
    ));
  }, timeoutMs);
}
