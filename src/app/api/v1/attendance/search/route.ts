import { z } from "zod";
import { inGym } from "@/server/auth/context";
import { route } from "@/server/http/route";
import { searchForCheckIn } from "@/server/modules/attendance/service";

const query = z.object({ q: z.string().trim().min(1).max(60) });

/** Member search for manual check-in (active members only). */
export const GET = route({ auth: "gym", permission: "attendance.record", query }, async ({ ctx, query }) =>
  inGym(ctx, (tx) => searchForCheckIn(tx, ctx, query.q)),
);
