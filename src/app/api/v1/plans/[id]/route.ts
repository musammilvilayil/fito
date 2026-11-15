import { planSchema } from "@/shared/schemas/billing";
import { inGym } from "@/server/auth/context";
import { route } from "@/server/http/route";
import { updatePlan } from "@/server/modules/plans/service";

export const PATCH = route({ auth: "gym", permission: "plans.manage", body: planSchema }, async ({ ctx, body, params }) =>
  inGym(ctx, (tx) => updatePlan(tx, ctx, params.id!, body)),
);
