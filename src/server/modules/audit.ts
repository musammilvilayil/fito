import "server-only";
import type { GymContext } from "../auth/context";
import { auditLogs } from "../db/schema";
import type { Tx } from "../db/tx";

/** Records who did what. Call inside the same transaction as the change. */
export async function audit(
  tx: Tx,
  ctx: Pick<GymContext, "user" | "gym">,
  action: string,
  entityType: string,
  entityId: string | null,
  metadata?: Record<string, unknown>,
) {
  await tx.insert(auditLogs).values({
    gymId: ctx.gym.id,
    actorUserId: ctx.user.id,
    action,
    entityType,
    entityId,
    metadata: metadata ?? null,
  });
}
