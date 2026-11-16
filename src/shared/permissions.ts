/**
 * Role-based permissions. Roles are fixed for the MVP; the owner assigns a
 * role to each staff member. Tenant isolation is enforced separately by the
 * database (row-level security); these checks decide what a person may do
 * inside their own gym.
 */
export const STAFF_ROLES = ["owner", "manager", "trainer", "receptionist"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];
export type Role = StaffRole | "member";

export const PERMISSIONS = [
  "gym.manage",
  "staff.manage",
  "members.view_all",
  "members.add",
  "members.manage",
  "members.assign_trainer",
  "plans.manage",
  "memberships.manage",
  "payments.record",
  "payments.view",
  "payments.void",
  "attendance.record",
  "attendance.view",
  "attendance.override",
  "reports.view",
  "workouts.manage",
  "workouts.approve",
  "exercises.manage",
  "equipment.manage",
  "ai.generate",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL = new Set<Permission>(PERMISSIONS);

export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  owner: ALL,
  manager: new Set(PERMISSIONS.filter((p) => p !== "gym.manage")),
  receptionist: new Set<Permission>([
    "members.view_all",
    "members.add",
    "members.manage",
    "memberships.manage",
    "payments.record",
    "payments.view",
    "attendance.record",
    "attendance.view",
  ]),
  // Trainers work with the members assigned to them. Members a trainer adds
  // are assigned to that trainer.
  trainer: new Set<Permission>([
    "members.add",
    "attendance.view",
    "workouts.manage",
    "workouts.approve",
    "exercises.manage",
    "equipment.manage",
    "ai.generate",
  ]),
  member: new Set<Permission>(),
};

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  manager: "Manager",
  trainer: "Trainer",
  receptionist: "Front desk",
  member: "Member",
};

export const ROLE_DESCRIPTIONS: Record<StaffRole, string> = {
  owner: "Full access, including gym settings and staff.",
  manager: "Runs daily operations: members, payments, staff and reports.",
  trainer: "Works with assigned members: workout plans, AI suggestions, progress.",
  receptionist: "Front desk: members, memberships, payments and check-ins.",
};

export const PERMISSION_LABELS: Record<Permission, string> = {
  "gym.manage": "Edit gym profile and settings",
  "staff.manage": "Invite and manage staff",
  "members.view_all": "View all members",
  "members.add": "Add new members (a trainer's go to that trainer)",
  "members.manage": "Edit, import and deactivate members",
  "members.assign_trainer": "Assign trainers to members",
  "plans.manage": "Create and edit membership plans",
  "memberships.manage": "Sell, renew and freeze memberships",
  "payments.record": "Record payments",
  "payments.view": "View payments and dues",
  "payments.void": "Void payments and record refunds",
  "attendance.record": "Check members in",
  "attendance.view": "View attendance",
  "attendance.override": "Check in members without an active membership",
  "reports.view": "View revenue and business reports",
  "workouts.manage": "Create and edit workout plans",
  "workouts.approve": "Approve workout plans",
  "exercises.manage": "Add custom exercises",
  "equipment.manage": "Manage the gym's equipment list",
  "ai.generate": "Generate AI workout suggestions",
};
