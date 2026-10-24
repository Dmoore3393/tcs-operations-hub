import { Capacitor } from "@capacitor/core";

const API_ORIGIN = "https://tcs-operations-hub.vercel.app";

/** The packaged iPhone UI uses the existing authenticated Vercel API.
 * Bearer headers and form bodies are preserved. No private server key is bundled.
 */
export function ensureNativeApiTransport() {
  if (typeof window === "undefined" || !Capacitor.isNativePlatform()) return;
  if (window.location.protocol !== "capacitor:" || window.location.host !== "localhost") return;
  const target = window as typeof window & { __TCS_NATIVE_API_READY__?: boolean };
  if (target.__TCS_NATIVE_API_READY__) return;
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const raw = input instanceof Request ? input.url : String(input);
    const url = new URL(raw, window.location.href);
    if (url.protocol === window.location.protocol && url.host === window.location.host && url.pathname.startsWith("/api/")) {
      const destination = new URL(url.pathname + url.search, API_ORIGIN);
      return originalFetch(input instanceof Request ? new Request(destination, input) : destination, init);
    }
    return originalFetch(input, init);
  };
  target.__TCS_NATIVE_API_READY__ = true;
}
