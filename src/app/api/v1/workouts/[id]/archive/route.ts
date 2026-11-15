import { inGym } from "@/server/auth/context";
import { route } from "@/server/http/route";
import { archivePlan } from "@/server/modules/workouts/service";

export const POST = route({ auth: "gym", permission: "workouts.manage" }, async ({ ctx, params }) =>
  inGym(ctx, async (tx) => {
    await archivePlan(tx, ctx, params.id!);
    return { ok: true };
  }),
);
