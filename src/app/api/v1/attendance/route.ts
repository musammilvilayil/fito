import { attendanceDayQuery } from "@/shared/schemas/attendance";
import { inGym } from "@/server/auth/context";
import { route } from "@/server/http/route";
import { listDay } from "@/server/modules/attendance/service";
import { gymToday } from "@/server/modules/members/service";

export const GET = route({ auth: "gym", query: attendanceDayQuery }, async ({ ctx, query }) =>
  inGym(ctx, (tx) => listDay(tx, ctx, query.date ?? gymToday(ctx))),
);
