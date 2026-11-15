import { loginSchema } from "@/shared/schemas/auth";
import { sessionResponse } from "@/server/http/cookies";
import { clientIp, route } from "@/server/http/route";
import { login } from "@/server/modules/auth/service";

export const POST = route({ auth: "public", body: loginSchema }, async ({ req, body }) => {
  const session = await login(body, { ip: clientIp(req), userAgent: req.headers.get("user-agent") });
  return sessionResponse(req, session, { userId: session.userId });
});
