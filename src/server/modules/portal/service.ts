import "server-only";
import type { GymContext } from "../../auth/context";
import { sequential, type Tx } from "../../db/tx";
import { forbidden } from "../../errors";
import { memberAttendance } from "../attendance/service";
import { listMemberMemberships, listMemberPayments } from "../memberships/service";
import { getMember, type MemberDetail } from "../members/service";
import { listNotifications } from "../notifications/service";
import { activePlanFor } from "../workouts/service";
import { listWorkoutLogs } from "../workouts/tracking";

/**
 * What a member may see about themself. Staff-only fields (internal notes,
 * invite state, the raw QR token) are left out.
 */
export function selfView(m: MemberDetail) {
  return {
    id: m.id,
    memberCode: m.memberCode,
    fullName: m.fullName,
    phone: m.phone,
    email: m.email,
    gender: m.gender,
    dateOfBirth: m.dateOfBirth,
    emergencyContactName: m.emergencyContactName,
    emergencyContactPhone: m.emergencyContactPhone,
    joinedOn: m.joinedOn,
    trainerName: m.trainerName,
    standing: m.standing,
    current: m.current,
    fitness: m.fitness,
  };
}
export type MemberSelfView = ReturnType<typeof selfView>;

function requireSelf(ctx: GymContext): string {
  if (!ctx.memberId) throw forbidden("This is for members. Staff use the dashboard.");
  return ctx.memberId;
}

/** Everything the member home screen needs, in one transaction. */
export async function memberHome(tx: Tx, ctx: GymContext) {
  const memberId = requireSelf(ctx);
  const [member, memberships, attendance, plan, logs, notifications] = await sequential(
    () => getMember(tx, ctx, memberId),
    () => listMemberMemberships(tx, ctx, memberId),
    () => memberAttendance(tx, ctx, memberId, 30),
    () => activePlanFor(tx, ctx, memberId),
    () => listWorkoutLogs(tx, ctx, memberId, 10),
    () => listNotifications(tx, ctx, 10),
  );
  const outstandingPaise = memberships.reduce((sum, m) => sum + m.outstandingPaise, 0);
  return {
    member: selfView(member),
    outstandingPaise,
    attendance,
    plan: plan ? { id: plan.plan.id, name: plan.plan.name, goal: plan.plan.goal, approvedBy: plan.approvedBy, content: plan.content, exercises: plan.exercises } : null,
    logs,
    notifications,
  };
}

/** Memberships and payments (with receipt links) for the member. */
export async function memberBilling(tx: Tx, ctx: GymContext) {
  const memberId = requireSelf(ctx);
  const [memberships, payments] = await sequential(
    () => listMemberMemberships(tx, ctx, memberId),
    () => listMemberPayments(tx, ctx, memberId),
  );
  return {
    memberships,
    payments: payments.map((p) => ({
      id: p.id,
      kind: p.kind,
      amountPaise: p.amountPaise,
      method: p.method,
      receiptNumber: p.receiptNumber,
      paidAt: p.paidAt,
      voidedAt: p.voidedAt,
    })),
  };
}
