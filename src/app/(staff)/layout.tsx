import { navFor } from "@/components/shell/nav";
import { StaffShell } from "@/components/shell/staff-shell";
import { ROLE_LABELS } from "@/shared/permissions";
import { requireStaffContext } from "@/server/auth/page";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireStaffContext();
  return (
    <StaffShell
      demo={ctx.gym.settings.demo === true}
      nav={navFor(ctx.permissions)}
      gymName={ctx.gym.name}
      gymId={ctx.gym.id}
      roleLabel={ROLE_LABELS[ctx.role]}
      userName={ctx.user.fullName}
      gyms={ctx.memberships.map((m) => ({ gymId: m.gymId, gymName: m.gymName, roleLabel: ROLE_LABELS[m.role] }))}
    >
      {children}
    </StaffShell>
  );
}
