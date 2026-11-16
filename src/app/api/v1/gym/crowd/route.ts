import { inGym } from "@/server/auth/context";
import { route } from "@/server/http/route";
import { gymCrowd } from "@/server/modules/attendance/crowd";

/** How busy the gym is now and usually is today (counts only). Anyone in the gym, members included. */
export const GET = route({ auth: "gym" }, async ({ ctx }) => inGym(ctx, (tx) => gymCrowd(tx, ctx)));
