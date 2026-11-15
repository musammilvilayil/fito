import { inGym } from "@/server/auth/context";
import { route } from "@/server/http/route";
import { revisePlan } from "@/server/modules/workouts/service";

/** Copies a plan into a new draft; the current plan stays live until the copy is approved. */
export const POST = route({ auth: "gym", permission: "workouts.manage" }, async ({ ctx, params }) =>
  inGym(ctx, (tx) => revisePlan(tx, ctx, params.id!)),
);
