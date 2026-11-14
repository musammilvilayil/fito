import { z } from "zod";
import { planSchema } from "@/shared/schemas/billing";
import { inGym } from "@/server/auth/context";
import { route } from "@/server/http/route";
import { createPlan, listPlans } from "@/server/modules/plans/service";

const query = z.object({ includeInactive: z.enum(["true", "false"]).optional() });

export const GET = route({ auth: "gym", query }, async ({ ctx, query }) =>
  inGym(ctx, (tx) => listPlans(tx, ctx, { includeInactive: query.includeInactive === "true" })),
);

export const POST = route({ auth: "gym", permission: "plans.manage", body: planSchema }, async ({ ctx, body }) =>
  inGym(ctx, (tx) => createPlan(tx, ctx, body)),
);
