/** Errors that map to HTTP responses. Anything else becomes a 500. */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (message: string, details?: unknown) => new AppError(400, "bad_request", message, details);
export const unauthorized = (message = "Please sign in to continue.") => new AppError(401, "unauthorized", message);
export const forbidden = (message = "You don't have permission to do that.") =>
  new AppError(403, "forbidden", message);
export const notFound = (message = "Not found.") => new AppError(404, "not_found", message);
export const conflict = (message: string, details?: unknown) => new AppError(409, "conflict", message, details);
export const tooManyRequests = (message = "Too many attempts. Please wait a few minutes and try again.") =>
  new AppError(429, "rate_limited", message);
export const serviceUnavailable = (message: string) => new AppError(503, "unavailable", message);

/** Detects a Postgres unique violation (23505) and returns the constraint name. */
export function uniqueViolation(err: unknown): string | null {
  let e: unknown = err;
  for (let i = 0; i < 3 && e; i++) {
    if (typeof e === "object" && e !== null && "code" in e && (e as { code: unknown }).code === "23505") {
      return (e as { constraint?: string }).constraint ?? "unique";
    }
    e = (e as { cause?: unknown }).cause;
  }
  return null;
}
