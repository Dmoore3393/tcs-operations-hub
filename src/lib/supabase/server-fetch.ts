/** Opaque API keys authenticate the application through apikey, never as user JWTs.
 * Keep real user bearer tokens and legacy JWT keys intact.
 */
export function serverApiKeyFetch(transport: typeof fetch = fetch): typeof fetch {
  return (input, init) => {
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    const key = headers.get("apikey");
    if (key && (key.startsWith("sb_secret_") || key.startsWith("sb_publishable_"))
      && headers.get("Authorization") === `Bearer ${key}`) {
      headers.delete("Authorization");
    }
    return transport(input, {...init, headers});
  };
}
