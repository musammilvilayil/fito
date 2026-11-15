import type { Metadata } from "next";
import { AccessDenied } from "@/components/ui/states";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, ROLE_PERMISSIONS, PERMISSION_LABELS, STAFF_ROLES, PERMISSIONS } from "@/shared/permissions";
import { inGym } from "@/server/auth/context";
import { requireStaffContext } from "@/server/auth/page";
import { listStaff } from "@/server/modules/staff/service";
import { RoleMatrix } from "./role-matrix";
import { StaffManager } from "./staff-manager";

export const metadata: Metadata = { title: "Staff & roles" };

export default async function StaffPage() {
  const ctx = await requireStaffContext();
  if (!ctx.permissions.has("staff.manage")) return <AccessDenied />;
  const staff = await inGym(ctx, (tx) => listStaff(tx, ctx));
  return (
    <div className="space-y-6">
      <StaffManager
        staff={staff.map((s) => ({
          ...s,
          inviteExpiresAt: s.inviteExpiresAt?.toISOString() ?? null,
          createdAt: s.createdAt.toISOString(),
        }))}
        currentRole={ctx.role}
        currentUserId={ctx.user.id}
      />
      <RoleMatrix
        roles={STAFF_ROLES.map((r) => ({
          role: r,
          label: ROLE_LABELS[r],
          description: ROLE_DESCRIPTIONS[r],
          permissions: PERMISSIONS.filter((p) => ROLE_PERMISSIONS[r].has(p)),
        }))}
        permissionLabels={PERMISSION_LABELS}
      />
    </div>
  );
}
