import "server-only";
import { eq, sql } from "drizzle-orm";
import { inGym, requirePermission, resolveGymContext, type GymContext } from "../../auth/context";
import { randomToken } from "../../auth/crypto";
import { rateLimit, setActiveGym, type SessionInfo } from "../../auth/session";
import { gyms } from "../../db/schema";
import { withScope, type Tx } from "../../db/tx";
import { AppError, forbidden, notFound } from "../../errors";
import { audit } from "../audit";
import { selfCheckIn, selfCheckOut } from "./service";

/**
 * A member scans the QR posted at the gym's entrance (check in) or exit
 * (check out). The code identifies the gym and the direction; the person is
 * the signed-in member, so nobody can check someone else in or out.
 */
export async function scanGymCode(session: SessionInfo, token: string) {
  await rateLimit(`scan:user:${session.user.id}`, 30, 3600);
  const hit = await withScope({ userId: session.user.id }, async (tx) => {
    const r = await tx.execute(sql`select gym_id, direction from fito_scan_gym(${token})`);
    return r.rows[0] as { gym_id: string; direction: "in" | "out" } | undefined;
  });
  if (!hit) throw notFound("This QR code isn't valid any more. Ask the front desk for the current one.");

  const resolution = await resolveGymContext(session, hit.gym_id).catch((err) => {
    if (err instanceof AppError && err.status === 403) {
      throw forbidden("You're not a member of this gym yet. Join it in the FITO app or ask the front desk to add you.");
    }
    throw err;
  });
  if (resolution.kind !== "ok") throw forbidden("You're not a member of this gym yet.");
  const ctx = resolution.ctx;
  if (!ctx.memberId) throw forbidden("These codes are for members. Staff check people in from Attendance.");

  const result =
    hit.direction === "in"
      ? { direction: "in" as const, ...(await inGym(ctx, (tx) => selfCheckIn(tx, ctx))) }
      : { direction: "out" as const, ...(await inGym(ctx, (tx) => selfCheckOut(tx, ctx))) };
  await setActiveGym(session, ctx.gym.id);
  return { gymName: ctx.gym.name, ...result };
}

/** The gym's entrance and exit codes (for printing). */
export async function getScanCodes(tx: Tx, ctx: GymContext) {
  const [g] = await tx.select({ entrance: gyms.entranceToken, exit: gyms.exitToken }).from(gyms).where(eq(gyms.id, ctx.gym.id));
  if (!g?.entrance || !g.exit) return rotateScanCodes(tx, ctx, false);
  return { entrance: g.entrance, exit: g.exit };
}

/** New codes: the printed ones stop working at once (e.g. if a photo of them was shared). */
export async function rotateScanCodes(tx: Tx, ctx: GymContext, check = true) {
  if (check) requirePermission(ctx, "gym.manage");
  const codes = { entrance: randomToken(24), exit: randomToken(24) };
  await tx.update(gyms).set({ entranceToken: codes.entrance, exitToken: codes.exit, updatedAt: new Date() }).where(eq(gyms.id, ctx.gym.id));
  if (check) await audit(tx, ctx, "gym.scan_codes_replaced", "gym", ctx.gym.id);
  return codes;
}
