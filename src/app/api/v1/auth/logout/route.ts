import { NextResponse } from "next/server";
import { destroySession } from "@/server/auth/session";
import { clearSessionCookie } from "@/server/http/cookies";
import { route } from "@/server/http/route";

export const POST = route({ auth: "public" }, async ({ session }) => {
  if (session) await destroySession(session);
  return clearSessionCookie(NextResponse.json({ data: { ok: true } }));
});
