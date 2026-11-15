import { inGym } from "@/server/auth/context";
import { route } from "@/server/http/route";
import { attendanceSummary } from "@/server/modules/attendance/service";

export const GET = route({ auth: "gym" }, async ({ ctx }) => inGym(ctx, (tx) => attendanceSummary(tx, ctx)));
