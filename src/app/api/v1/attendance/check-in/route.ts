import { checkInSchema } from "@/shared/schemas/attendance";
import { inGym } from "@/server/auth/context";
import { route } from "@/server/http/route";
import { checkIn } from "@/server/modules/attendance/service";

/**
 * Check a member in by scanned QR (`{ qr }`) or by hand (`{ memberId }`).
 * Refusals return 409/422 with `error.code` (e.g. not_allowed_expired,
 * already_checked_in, unknown_qr) and the member in `error.details.member`.
 */
export const POST = route({ auth: "gym", permission: "attendance.record", body: checkInSchema }, async ({ ctx, body }) =>
  inGym(ctx, (tx) => checkIn(tx, ctx, body)),
);
