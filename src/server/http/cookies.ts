import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "../auth/session";
import { env } from "../env";

function secure() {
  return env().APP_URL.startsWith("https://") || process.env.NODE_ENV === "production";
}

/**
 * Web clients get an HttpOnly cookie. Mobile clients (`?client=mobile`)
 * receive the token in the body and send it as `Authorization: Bearer`.
 */
export function sessionResponse(
  req: NextRequest,
  session: { token: string; expiresAt: Date },
  data: Record<string, unknown> = {},
) {
  const isMobile = req.nextUrl.searchParams.get("client") === "mobile";
  const res = NextResponse.json({
    data: isMobile ? { ...data, token: session.token, expiresAt: session.expiresAt } : { ...data, expiresAt: session.expiresAt },
  });
  if (!isMobile) {
    res.cookies.set(SESSION_COOKIE, session.token, {
      httpOnly: true,
      secure: secure(),
      sameSite: "lax",
      path: "/",
      expires: session.expiresAt,
    });
  }
  return res;
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, secure: secure(), sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
