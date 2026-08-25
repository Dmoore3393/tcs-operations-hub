import "server-only";

export function tcsLocationSlug(value: string) {
  const lower = value.toLowerCase();
  if (lower.includes("halcom") || lower.includes("moore family")) return "halcom";
  if (lower.includes("21st") || lower.includes("cathers")) return "21st-street";
  if (lower.includes("division") || lower.includes("school age center") || lower.includes("astor")) return "division";
  if (lower.includes("33rd") || lower.includes("cornejo")) return "33rd-street";
  if (lower.includes("tehachapi")) return "tehachapi";
  if (lower.includes("42nd") || lower.includes("lara")) return "42nd-street";
  return null;
}
