/** Parse an access check without treating transport failures as denied access. */
export async function readAccessCheck<T>(
  response: Response,
  label: string,
  isValid: (payload: Record<string, unknown>) => boolean,
): Promise<T> {
  const reference = response.headers.get("x-vercel-id");
  const detail = `HTTP ${response.status}${reference ? "; reference " + reference : ""}`;
  const unexpected = () => new Error(
    `${label} received an unexpected server response (${detail}). Please retry.`,
  );
  let payload: unknown;
  try {
    payload = JSON.parse(await response.text());
  } catch {
    throw unexpected();
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw unexpected();
  const data = payload as Record<string, unknown>;
  if (typeof data.error === "string" && data.error.trim()) throw new Error(data.error);
  if (!response.ok || !isValid(data)) throw unexpected();
  return data as T;
}
