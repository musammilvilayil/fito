import "server-only";
import { and, eq } from "drizzle-orm";
import { ROLE_PERMISSIONS, type Permission, type Role, type StaffRole } from "@/shared/permissions";
import { gymStaff, gyms, members, type GymSettings } from "../db/schema";
import { withScope, type Tx } from "../db/tx";
import { forbidden } from "../errors";
import type { SessionInfo, SessionUser } from "./session";

export type GymMembership = {
  gymId: string;
  gymName: string;
  role: Role;
  staffId: string | null;
  memberId: string | null;
};

export type GymInfo = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  receiptPrefix: string;
  settings: GymSettings;
};

/** Everything a request needs to act inside one gym. */
export type GymContext = {
  user: SessionUser;
  sessionId: string;
  gym: GymInfo;
  role: Role;
  staffId: string | null;
  memberId: string | null;
  permissions: ReadonlySet<Permission>;
  memberships: GymMembership[];
};

export type ContextResolution =
  | { kind: "ok"; ctx: GymContext }
  | { kind: "select"; memberships: GymMembership[] }
  | { kind: "none" };

const ROLE_RANK: Record<Role, number> = { owner: 0, manager: 1, trainer: 2, receptionist: 3, member: 4 };

/** All gyms the user belongs to, as staff (active) or as a member. */
export async function listMemberships(tx: Tx, userId: string): Promise<GymMembership[]> {
  const staffRows = await tx
    .select({ gymId: gymStaff.gymId, gymName: gyms.name, role: gymStaff.role, staffId: gymStaff.id })
    .from(gymStaff)
    .innerJoin(gyms, eq(gyms.id, gymStaff.gymId))
    .where(and(eq(gymStaff.userId, userId), eq(gymStaff.status, "active")));
  const memberRows = await tx
    .select({ gymId: members.gymId, gymName: gyms.name, memberId: members.id })
    .from(members)
    .innerJoin(gyms, eq(gyms.id, members.gymId))
    .where(eq(members.userId, userId));

  const byGym = new Map<string, GymMembership>();
  for (const s of staffRows) {
    const existing = byGym.get(s.gymId);
    if (!existing || ROLE_RANK[s.role as StaffRole] < ROLE_RANK[existing.role]) {
      byGym.set(s.gymId, { gymId: s.gymId, gymName: s.gymName, role: s.role, staffId: s.staffId, memberId: null });
    }
  }
  for (const m of memberRows) {
    const existing = byGym.get(m.gymId);
    if (existing) existing.memberId = m.memberId;
    else byGym.set(m.gymId, { gymId: m.gymId, gymName: m.gymName, role: "member", staffId: null, memberId: m.memberId });
  }
  return [...byGym.values()].sort((a, b) => a.gymName.localeCompare(b.gymName));
}

/**
 * Picks the gym for this request: an explicitly requested gym (X-Gym-Id
 * header from the mobile app), else the session's active gym, else the only
 * gym. With several gyms and no choice yet, the user must pick one.
 */
export async function resolveGymContext(
  session: SessionInfo,
  requestedGymId?: string | null,
): Promise<ContextResolution> {
  return withScope({ userId: session.user.id }, async (tx) => {
    const memberships = await listMemberships(tx, session.user.id);
    if (memberships.length === 0) return { kind: "none" } as const;

    let chosen: GymMembership | undefined;
    if (requestedGymId) {
      chosen = memberships.find((m) => m.gymId === requestedGymId);
      if (!chosen) throw forbidden("You don't have access to that gym.");
    } else if (session.activeGymId) {
      chosen = memberships.find((m) => m.gymId === session.activeGymId);
    }
    if (!chosen && memberships.length === 1) chosen = memberships[0];
    if (!chosen) return { kind: "select", memberships } as const;

    const [gym] = await tx
      .select({
        id: gyms.id,
        name: gyms.name,
        slug: gyms.slug,
        timezone: gyms.timezone,
        receiptPrefix: gyms.receiptPrefix,
        settings: gyms.settings,
      })
      .from(gyms)
      .where(eq(gyms.id, chosen.gymId));
    if (!gym) return { kind: "select", memberships } as const;

    return {
      kind: "ok",
      ctx: {
        user: session.user,
        sessionId: session.sessionId,
        gym,
        role: chosen.role,
        staffId: chosen.staffId,
        memberId: chosen.memberId,
        permissions: ROLE_PERMISSIONS[chosen.role],
        memberships,
      },
    } as const;
  });
}

export function hasPermission(ctx: GymContext, permission: Permission): boolean {
  return ctx.permissions.has(permission);
}

export function requirePermission(ctx: GymContext, permission: Permission) {
  if (!ctx.permissions.has(permission)) throw forbidden();
}

export function isStaff(ctx: GymContext): boolean {
  return ctx.role !== "member";
}

/** Runs `fn` inside a transaction scoped to the context's user and gym. */
export function inGym<T>(ctx: GymContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return withScope({ userId: ctx.user.id, gymId: ctx.gym.id }, fn);
}
