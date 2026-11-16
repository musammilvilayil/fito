/**
 * A same-site path to return to after signing in, or null. Only plain
 * relative paths are accepted ("/s/abc"), never "//evil.com", "/\evil.com"
 * or absolute URLs, so the parameter can't send people to another site.
 */
export function safeNext(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 300) return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null;
  if (/[\u0000-\u001f\\]/.test(value)) return null;
  return value;
}
