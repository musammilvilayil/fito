import { memberSignupSchema } from "@/shared/schemas/auth";
import { sessionResponse } from "@/server/http/cookies";
import { clientIp, route } from "@/server/http/route";
import { registerMember } from "@/server/modules/auth/member-signup";

/** A member creates their own account (no gym yet). Then: GET /gyms/search and POST /gyms/join. */
export const POST = route({ auth: "public", body: memberSignupSchema }, async ({ req, body }) => {
  const session = await registerMember(body, { ip: clientIp(req), userAgent: req.headers.get("user-agent") });
  return sessionResponse(req, session, { userId: session.userId });
});
