import { rangeQuery } from "@/shared/schemas/attendance";
import { inGym } from "@/server/auth/context";
import { route } from "@/server/http/route";
import { getReport } from "@/server/modules/reports/service";

export const GET = route({ auth: "gym", permission: "reports.view", query: rangeQuery }, async ({ ctx, query }) =>
  inGym(ctx, (tx) => getReport(tx, ctx, query)),
);
