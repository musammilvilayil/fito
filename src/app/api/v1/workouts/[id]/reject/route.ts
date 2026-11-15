import { rejectPlanSchema } from "@/shared/schemas/workout";
import { inGym } from "@/server/auth/context";
import { route } from "@/server/http/route";
import { rejectPlan } from "@/server/modules/workouts/service";

export const POST = route({ auth: "gym", permission: "workouts.approve", body: rejectPlanSchema }, async ({ ctx, body, params }) =>
  inGym(ctx, async (tx) => {
    await rejectPlan(tx, ctx, params.id!, body.reason);
    return { ok: true };
  }),
);
