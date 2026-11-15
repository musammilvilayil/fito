import { generatePlanSchema } from "@/shared/schemas/workout";
import { route } from "@/server/http/route";
import { generatePlan } from "@/server/modules/workouts/service";

// AI drafting can take up to a minute or two (one retry). Needs a host plan
// that allows this duration (e.g. Vercel Pro); see docs/DEPLOYMENT.md.
export const maxDuration = 180;

/**
 * Creates a plan for review: `mode` = "ai" (Claude, validated, template
 * fallback), "template" (rule-based) or "blank". Never activates a plan.
 */
export const POST = route({ auth: "gym", permission: "workouts.manage", body: generatePlanSchema }, async ({ ctx, body }) =>
  generatePlan(ctx, { memberId: body.memberId, mode: body.mode, instructions: body.instructions }),
);
