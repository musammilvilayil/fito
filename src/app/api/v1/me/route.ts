import { inGym } from "@/server/auth/context";
import { route } from "@/server/http/route";
import { memberHome } from "@/server/modules/portal/service";

/** Member home: profile, membership, dues, attendance, active plan, recent logs and notifications. */
export const GET = route({ auth: "gym" }, async ({ ctx }) => inGym(ctx, (tx) => memberHome(tx, ctx)));
