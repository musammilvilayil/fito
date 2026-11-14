import { inGym } from "@/server/auth/context";
import { route } from "@/server/http/route";
import { listTrainers } from "@/server/modules/staff/service";

/** Staff who can coach members (trainers, plus owners/managers who train). */
export const GET = route({ auth: "gym" }, async ({ ctx }) => inGym(ctx, (tx) => listTrainers(tx, ctx)));
