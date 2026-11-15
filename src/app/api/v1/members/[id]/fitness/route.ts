import { fitnessProfileSchema } from "@/shared/schemas/workout";
import { inGym } from "@/server/auth/context";
import { route } from "@/server/http/route";
import { updateFitnessProfile } from "@/server/modules/workouts/service";

/** Fitness profile (goal, level, schedule, limitations). Staff coaching the member, or the member. */
export const PUT = route({ auth: "gym", body: fitnessProfileSchema }, async ({ ctx, body, params }) =>
  inGym(ctx, async (tx) => {
    await updateFitnessProfile(tx, ctx, params.id!, body);
    return { ok: true };
  }),
);
