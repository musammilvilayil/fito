import { NextResponse } from "next/server";
import { acceptInviteSchema } from "@/shared/schemas/auth";
import { setActiveGym } from "@/server/auth/session";
import { sessionResponse } from "@/server/http/cookies";
import { clientIp, route } from "@/server/http/route";
import { acceptInvite } from "@/server/modules/auth/service";

export const POST = route({ auth: "public", body: acceptInviteSchema }, async ({ req, body, session }) => {
  const result = await acceptInvite(body, session, { ip: clientIp(req), userAgent: req.headers.get("user-agent") });
  if (result.token && result.expiresAt) {
    return sessionResponse(req, { token: result.token, expiresAt: result.expiresAt }, { gymId: result.gymId });
  }
  if (session) await setActiveGym(session, result.gymId);
  return NextResponse.json({ data: { gymId: result.gymId } });
});
