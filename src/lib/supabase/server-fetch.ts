/** Opaque API keys authenticate the application through apikey, never as user JWTs.
 * Keep real user bearer tokens and legacy JWT keys intact.
 */
export function serverApiKeyFetch(transport: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    const key = headers.get("apikey");
    if (key && (key.startsWith("sb_secret_") || key.startsWith("sb_publishable_"))
      && headers.get("Authorization") === `Bearer ${key}`) {
      headers.delete("Authorization");
    }
    const response = await transport(input, {...init, headers});
    if (response.status === 401) {
      // Log only a known token-validation reason, never headers, tokens or staff data.
      try {
        const error = await response.clone().json();
        if (error?.code === "PGRST303") {
          const message = String(error.message ?? "");
          const reason = /expired/i.test(message) ? "expired"
            : /future/i.test(message) ? "issued-at-future"
            : /signature/i.test(message) ? "signature-invalid"
            : /claim/i.test(message) ? "claims-invalid"
            : /decode|parse|compact|segments/i.test(message) ? "token-format-invalid"
            : "other-token-validation";
          console.error("Supabase server token validation failed", {code: "PGRST303", reason});
        }
      } catch { /* Preserve the original response when the error body is not JSON. */ }
    }
    return response;
  };
}
