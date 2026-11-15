import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import type { Permission } from "@/shared/permissions";
import { requirePermission, resolveGymContext, type GymContext } from "../auth/context";
import { resolveSession, SESSION_COOKIE, type SessionInfo } from "../auth/session";
import { env } from "../env";
import { AppError, badRequest, forbidden, unauthorized, uniqueViolation } from "../errors";
import { errorFields, logger } from "../logger";

type AuthMode = "public" | "user" | "gym";
type Schema = z.ZodType;
type Out<S> = S extends Schema ? z.output<S> : undefined;

type Options<B, Q> = {
  auth: AuthMode;
  permission?: Permission;
  body?: B;
  query?: Q;
};

type HandlerArgs<B, Q, A extends AuthMode> = {
  req: NextRequest;
  params: Record<string, string>;
  body: Out<B>;
  query: Out<Q>;
  session: A extends "public" ? SessionInfo | null : SessionInfo;
  ctx: A extends "gym" ? GymContext : null;
};

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Browsers send Origin on cross-site POSTs; reject those for cookie sessions (CSRF). */
function verifyOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) throw forbidden("Missing request origin.");
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw forbidden("Invalid request origin.");
  }
  const allowed = new Set<string>([new URL(env().APP_URL).host]);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (host) allowed.add(host);
  if (!allowed.has(originHost)) throw forbidden("Cross-site request blocked.");
}

async function readJson(req: NextRequest): Promise<unknown> {
  const text = await req.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw badRequest("Request body must be valid JSON.");
  }
}

export function zodDetails(error: z.ZodError) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    fieldErrors[key] ??= issue.message;
  }
  return { fieldErrors };
}

function parseWith<S extends Schema>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const details = zodDetails(result.error);
    const first = Object.values(details.fieldErrors)[0] ?? "Invalid input";
    throw new AppError(400, "validation_error", first, details);
  }
  return result.data;
}

export function errorResponse(err: unknown, requestId: string) {
  if (err instanceof AppError) {
    return NextResponse.json(
      { error: { code: err.code, message: err.message, details: err.details ?? null } },
      { status: err.status },
    );
  }
  const constraint = uniqueViolation(err);
  if (constraint) {
    return NextResponse.json(
      { error: { code: "conflict", message: "This record already exists.", details: { constraint } } },
      { status: 409 },
    );
  }
  logger.error("Unhandled API error", { requestId, ...errorFields(err) });
  return NextResponse.json(
    { error: { code: "internal_error", message: "Something went wrong. Please try again.", details: { requestId } } },
    { status: 500 },
  );
}

/** Reads the session token from `Authorization: Bearer` (mobile) or the session cookie (web). */
export function readToken(req: NextRequest): { token: string | undefined; viaCookie: boolean } {
  const bearer = /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") ?? "")?.[1];
  if (bearer) return { token: bearer.trim(), viaCookie: false };
  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  // Only a request that actually carries the session cookie has ambient
  // authority worth protecting from CSRF. Native apps send neither a cookie
  // nor an Origin header, and any browser cross-site POST carries an Origin,
  // which is still checked below.
  return { token: cookie, viaCookie: Boolean(cookie) };
}

/**
 * Wraps a route handler with authentication, gym context, permission checks,
 * validation and consistent JSON errors: `{ data }` or `{ error }`.
 */
export function route<A extends AuthMode, B extends Schema | undefined = undefined, Q extends Schema | undefined = undefined>(
  opts: Options<B, Q> & { auth: A },
  handler: (args: HandlerArgs<B, Q, A>) => Promise<unknown>,
) {
  return async (req: NextRequest, context: { params: Promise<Record<string, string>> }) => {
    const requestId = crypto.randomUUID();
    const started = Date.now();
    try {
      const { token, viaCookie } = readToken(req);
      if (!SAFE_METHODS.has(req.method) && (viaCookie || req.headers.get("origin"))) verifyOrigin(req);

      const session = token ? await resolveSession(token) : null;
      if (opts.auth !== "public" && !session) throw unauthorized();

      let ctx: GymContext | null = null;
      if (opts.auth === "gym") {
        const resolution = await resolveGymContext(session!, req.headers.get("x-gym-id"));
        if (resolution.kind === "none") throw forbidden("You are not part of a gym yet.");
        if (resolution.kind === "select") throw forbidden("Select a gym first.");
        ctx = resolution.ctx;
        if (opts.permission) requirePermission(ctx, opts.permission);
      }

      const body = (opts.body ? parseWith(opts.body, await readJson(req)) : undefined) as Out<B>;
      const query = (
        opts.query ? parseWith(opts.query, Object.fromEntries(req.nextUrl.searchParams)) : undefined
      ) as Out<Q>;
      const params = (await context.params) ?? {};

      const result = await handler({ req, params, body, query, session, ctx } as HandlerArgs<B, Q, A>);
      logger.debug("api", { requestId, method: req.method, path: req.nextUrl.pathname, ms: Date.now() - started });
      if (result instanceof Response) return result;
      return NextResponse.json({ data: result ?? null });
    } catch (err) {
      return errorResponse(err, requestId);
    }
  };
}

export function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}
