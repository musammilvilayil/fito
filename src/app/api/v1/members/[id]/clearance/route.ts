import { clearanceSchema } from "@/shared/schemas/workout";
import { inGym } from "@/server/auth/context";
import { route } from "@/server/http/route";
import { recordClearance } from "@/server/modules/workouts/service";

/** Trainer records that a flagged health screening has been cleared. */
export const POST = route({ auth: "gym", permission: "workouts.approve", body: clearanceSchema }, async ({ ctx, body, params }) =>
  inGym(ctx, async (tx) => {
    await recordClearance(tx, ctx, params.id!, body.note);
    return { ok: true };
  }),
);
