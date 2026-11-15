import { planUpdateSchema } from "@/shared/schemas/workout";
import { inGym } from "@/server/auth/context";
import { route } from "@/server/http/route";
import { getPlanDetail, updatePlan } from "@/server/modules/workouts/service";

/** Plan with current content, versions and safety notes. Members can read their own active plan. */
export const GET = route({ auth: "gym" }, async ({ ctx, params }) => inGym(ctx, (tx) => getPlanDetail(tx, ctx, params.id!)));

/** Saves edits as a new version (drafts and plans awaiting review only). */
export const PATCH = route({ auth: "gym", permission: "workouts.manage", body: planUpdateSchema }, async ({ ctx, body, params }) =>
  inGym(ctx, (tx) => updatePlan(tx, ctx, params.id!, body)),
);
