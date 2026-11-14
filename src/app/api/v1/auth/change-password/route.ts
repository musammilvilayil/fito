import { changePasswordSchema } from "@/shared/schemas/auth";
import { route } from "@/server/http/route";
import { changePassword } from "@/server/modules/auth/service";

export const POST = route({ auth: "user", body: changePasswordSchema }, async ({ session, body }) => {
  await changePassword(session, body);
  return { ok: true };
});
