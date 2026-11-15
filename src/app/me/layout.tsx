import { MemberShell } from "@/components/shell/member-shell";
import { ROLE_LABELS } from "@/shared/permissions";
import { inGym } from "@/server/auth/context";
import { requireMemberContext } from "@/server/auth/page";
import { listNotifications } from "@/server/modules/notifications/service";

export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireMemberContext();
  const { unread } = await inGym(ctx, (tx) => listNotifications(tx, ctx, 1));
  return (
    <MemberShell
      demo={ctx.gym.settings.demo === true}
      gymName={ctx.gym.name}
      gymId={ctx.gym.id}
      userName={ctx.user.fullName}
      unread={unread}
      gyms={ctx.memberships.map((m) => ({ gymId: m.gymId, gymName: m.gymName, roleLabel: ROLE_LABELS[m.role] }))}
    >
      {children}
    </MemberShell>
  );
}
