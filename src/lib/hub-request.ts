import { withRequestTimeout } from "@/lib/request-timeout";

/** Bounded, authenticated requests. A failed request never becomes an empty save. */
export async function hubRequest<T>(url: string, token: string, init: RequestInit = {}): Promise<T> {
  return withRequestTimeout(async (signal) => {
    const request = () => fetch(url, {
      ...init,
      cache: "no-store",
      signal,
      headers: { Authorization: `Bearer ${token}`, ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
    });
    let response: Response;
    const attempts = (init.method || "GET").toUpperCase() === "GET" ? 2 : 1;
    for (let attempt = 0; ; attempt++) {
      try { response = await request(); break; }
      catch (reason) {
        if (!(reason instanceof TypeError) || signal.aborted) throw reason;
        if (attempt + 1 >= attempts) throw new Error("The Hub couldn’t connect. Check your connection, then try again.");
      }
    }
    const text = await response.text();
    let payload: T & { error?: string };
    try { payload = JSON.parse(text); }
    catch { throw new Error(response.ok ? "The Hub received an unreadable response. Please try again." : "The Hub couldn’t complete the request. Please try again."); }
    if (!response.ok) throw new Error(payload.error || "The request could not be completed. Please try again.");
    return payload;
  });
}
