import { z } from "zod";
import { inGym } from "@/server/auth/context";
import { route } from "@/server/http/route";
import { approvePlan } from "@/server/modules/workouts/service";

const body = z.object({ acknowledgeWarnings: z.boolean().default(false) });

/** Trainer approval: makes the plan active and visible to the member. */
export const POST = route({ auth: "gym", permission: "workouts.approve", body }, async ({ ctx, body, params }) =>
  inGym(ctx, async (tx) => {
    await approvePlan(tx, ctx, params.id!, body);
    return { ok: true };
  }),
);
