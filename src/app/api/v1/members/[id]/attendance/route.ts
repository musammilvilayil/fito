import { inGym } from "@/server/auth/context";
import { route } from "@/server/http/route";
import { memberAttendance } from "@/server/modules/attendance/service";

/** A member's visit history and streak. Members can read their own. */
export const GET = route({ auth: "gym" }, async ({ ctx, params }) => inGym(ctx, (tx) => memberAttendance(tx, ctx, params.id!)));
