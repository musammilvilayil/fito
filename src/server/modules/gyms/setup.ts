import "server-only";
import { and, eq, sql } from "drizzle-orm";
import type { GymContext } from "../../auth/context";
import { gymStaff, gyms, membershipPlans, members } from "../../db/schema";
import type { Tx } from "../../db/tx";

export type SetupStatus = {
  profileComplete: boolean;
  plans: number;
  members: number;
  staff: number;
};

/** What a new gym still has to do; drives the dashboard checklist. */
export async function getSetupStatus(tx: Tx, ctx: GymContext): Promise<SetupStatus> {
  const [row] = await tx
    .select({
      phone: gyms.phone,
      addressLine: gyms.addressLine,
      plans: sql<number>`(select count(*)::int from ${membershipPlans} where ${membershipPlans.gymId} = ${gyms.id} and ${membershipPlans.isActive})`,
      members: sql<number>`(select count(*)::int from ${members} where ${members.gymId} = ${gyms.id})`,
    })
    .from(gyms)
    .where(eq(gyms.id, ctx.gym.id));
  const [staff] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(gymStaff)
    .where(and(eq(gymStaff.gymId, ctx.gym.id), sql`${gymStaff.role} <> 'owner'`));
  return {
    profileComplete: Boolean(row?.phone && row?.addressLine),
    plans: row?.plans ?? 0,
    members: row?.members ?? 0,
    staff: staff?.n ?? 0,
  };
}
