import { z } from "zod";
import { route } from "@/server/http/route";
import { scanGymCode } from "@/server/modules/attendance/self-scan";

const body = z.object({ token: z.string().trim().min(16).max(200) });

/** A member scanned the gym's entrance (check in) or exit (check out) QR. */
export const POST = route({ auth: "user", body }, async ({ session, body }) => scanGymCode(session, body.token));
