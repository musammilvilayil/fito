import { switchGymSchema } from "@/shared/schemas/auth";
import { resolveGymContext } from "@/server/auth/context";
import { setActiveGym } from "@/server/auth/session";
import { route } from "@/server/http/route";

export const POST = route({ auth: "user", body: switchGymSchema }, async ({ session, body }) => {
  // Throws 403 when the user doesn't belong to that gym.
  const resolution = await resolveGymContext(session, body.gymId);
  await setActiveGym(session, body.gymId);
  return { gymId: body.gymId, role: resolution.kind === "ok" ? resolution.ctx.role : null };
});
