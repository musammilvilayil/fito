import { resetPasswordSchema } from "@/shared/schemas/auth";
import { clientIp, route } from "@/server/http/route";
import { resetPassword } from "@/server/modules/auth/service";

export const POST = route({ auth: "public", body: resetPasswordSchema }, async ({ req, body }) => {
  await resetPassword(body.token, body.password, { ip: clientIp(req), userAgent: req.headers.get("user-agent") });
  return { ok: true };
});
