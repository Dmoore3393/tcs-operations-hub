/** Packaged static pages and website routes share the same access rules. */
export function normalizeHubPathname(pathname: string) {
  return pathname.replace(/\/+$/, "") || "/";
}
