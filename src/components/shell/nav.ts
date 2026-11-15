import type { Permission, Role } from "@/shared/permissions";

export type NavKey =
  | "dashboard"
  | "assistant"
  | "members"
  | "plans"
  | "payments"
  | "attendance"
  | "workouts"
  | "exercises"
  | "reports"
  | "settings";

export type NavItem = { key: NavKey; label: string; href: string; section: "main" | "training" | "admin" };

type Rule = NavItem & { anyOf?: Permission[]; roles?: Role[] };

const RULES: Rule[] = [
  { key: "dashboard", label: "Dashboard", href: "/dashboard", section: "main" },
  { key: "assistant", label: "Assistant", href: "/assistant", section: "main" },
  { key: "members", label: "Members", href: "/members", section: "main", anyOf: ["members.view_all", "workouts.manage"] },
  { key: "attendance", label: "Attendance", href: "/attendance", section: "main", anyOf: ["attendance.record", "attendance.view"] },
  { key: "payments", label: "Payments", href: "/payments", section: "main", anyOf: ["payments.view"] },
  { key: "plans", label: "Plans", href: "/plans", section: "main", anyOf: ["plans.manage", "memberships.manage"] },
  { key: "workouts", label: "Workouts", href: "/workouts", section: "training", anyOf: ["workouts.manage"] },
  { key: "exercises", label: "Exercise library", href: "/exercises", section: "training", anyOf: ["workouts.manage"] },
  { key: "reports", label: "Reports", href: "/reports", section: "admin", anyOf: ["reports.view"] },
  { key: "settings", label: "Settings", href: "/settings", section: "admin", anyOf: ["gym.manage", "staff.manage"] },
];

/** Modules live in the app so far. Each phase adds its module here. */
export const ENABLED_MODULES = new Set<NavKey>(["dashboard", "assistant", "members", "attendance", "payments", "plans", "workouts", "exercises", "reports", "settings"]);

export function navFor(permissions: ReadonlySet<Permission>): NavItem[] {
  return RULES.filter((r) => ENABLED_MODULES.has(r.key))
    .filter((r) => !r.anyOf || r.anyOf.some((p) => permissions.has(p)))
    .map(({ key, label, href, section }) => ({ key, label, href, section }));
}
