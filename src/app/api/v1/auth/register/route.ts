import { registerSchema } from "@/shared/schemas/auth";
import { sessionResponse } from "@/server/http/cookies";
import { clientIp, route } from "@/server/http/route";
import { registerGymOwner } from "@/server/modules/auth/service";

export const POST = route({ auth: "public", body: registerSchema }, async ({ req, body }) => {
  const result = await registerGymOwner(body, { ip: clientIp(req), userAgent: req.headers.get("user-agent") });
  return sessionResponse(req, result, { userId: result.userId, gymId: result.gymId });
});
