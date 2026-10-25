import { withRequestTimeout } from "@/lib/request-timeout";

/** Bounded, authenticated requests. A failed request never becomes an empty save. */
export async function hubRequest<T>(url: string, token: string, init: RequestInit = {}): Promise<T> {
  return withRequestTimeout(async (signal) => {
    const response = await fetch(url, {
      ...init,
      cache: "no-store",
      signal,
      headers: { Authorization: `Bearer ${token}`, ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
    });
    const text = await response.text();
    let payload: T & { error?: string };
    try { payload = JSON.parse(text); }
    catch { throw new Error(response.ok ? "The Hub received an unreadable response. Please try again." : text || "The request could not be completed. Please try again."); }
    if (!response.ok) throw new Error(payload.error || "The request could not be completed. Please try again.");
    return payload;
  });
}
