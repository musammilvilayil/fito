import { inGym } from "@/server/auth/context";
import { route } from "@/server/http/route";
import { deleteProgressEntry } from "@/server/modules/workouts/tracking";

export const DELETE = route({ auth: "gym" }, async ({ ctx, params }) =>
  inGym(ctx, async (tx) => {
    await deleteProgressEntry(tx, ctx, params.id!);
    return { ok: true };
  }),
);
