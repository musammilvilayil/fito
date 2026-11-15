import { resolveGymContext } from "@/server/auth/context";
import { route } from "@/server/http/route";

/** Current user, their gyms and (when chosen) the active gym and role. */
export const GET = route({ auth: "user" }, async ({ req, session }) => {
  const resolution = await resolveGymContext(session, req.headers.get("x-gym-id"));
  return {
    user: session.user,
    memberships: resolution.kind === "none" ? [] : resolution.kind === "select" ? resolution.memberships : resolution.ctx.memberships,
    active:
      resolution.kind === "ok"
        ? {
            gym: { id: resolution.ctx.gym.id, name: resolution.ctx.gym.name, timezone: resolution.ctx.gym.timezone },
            role: resolution.ctx.role,
            staffId: resolution.ctx.staffId,
            memberId: resolution.ctx.memberId,
            permissions: [...resolution.ctx.permissions],
          }
        : null,
  };
});
