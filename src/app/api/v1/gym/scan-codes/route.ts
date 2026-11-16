import { hasPermission, inGym } from "@/server/auth/context";
import { forbidden } from "@/server/errors";
import { route } from "@/server/http/route";
import { getScanCodes, rotateScanCodes } from "@/server/modules/attendance/self-scan";
import { env } from "@/server/env";

const urls = (c: { entrance: string; exit: string }) => ({ entranceUrl: `${env().APP_URL}/s/${c.entrance}`, exitUrl: `${env().APP_URL}/s/${c.exit}` });

/** The entrance and exit QR links to print (front desk, managers, owners). */
export const GET = route({ auth: "gym" }, async ({ ctx }) => {
  if (!hasPermission(ctx, "attendance.record") && !hasPermission(ctx, "gym.manage")) throw forbidden();
  return urls(await inGym(ctx, (tx) => getScanCodes(tx, ctx)));
});

/** Replace both codes; printed copies stop working at once (owners). */
export const POST = route({ auth: "gym", permission: "gym.manage" }, async ({ ctx }) => urls(await inGym(ctx, (tx) => rotateScanCodes(tx, ctx))));
