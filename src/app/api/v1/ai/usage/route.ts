import { inGym } from "@/server/auth/context";
import { route } from "@/server/http/route";
import { aiUsage } from "@/server/modules/workouts/service";

/** This month's AI generations, tokens and estimated cost for the gym. */
export const GET = route({ auth: "gym", permission: "ai.generate" }, async ({ ctx }) => inGym(ctx, (tx) => aiUsage(tx, ctx)));
