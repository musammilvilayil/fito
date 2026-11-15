import { z } from "zod";
import { inGym } from "@/server/auth/context";
import { route } from "@/server/http/route";
import { listPlans } from "@/server/modules/workouts/service";

const query = z.object({
  status: z.enum(["draft", "pending_review", "active", "rejected", "archived"]).optional(),
  memberId: z.uuid().optional(),
});

export const GET = route({ auth: "gym", permission: "workouts.manage", query }, async ({ ctx, query }) =>
  inGym(ctx, (tx) => listPlans(tx, ctx, query)),
);
