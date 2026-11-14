import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page";
import { inGym } from "@/server/auth/context";
import { requireStaffContext } from "@/server/auth/page";
import { getSetupStatus } from "@/server/modules/gyms/setup";
import { SetupChecklist } from "./setup-checklist";

export const metadata: Metadata = { title: "Dashboard" };

function greeting(timeZone: string) {
  const hour = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: false, timeZone }).format(new Date()));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

export default async function DashboardPage() {
  const ctx = await requireStaffContext();
  const setup = await inGym(ctx, (tx) => getSetupStatus(tx, ctx));
  const firstName = ctx.user.fullName.split(" ")[0];

  return (
    <>
      <PageHeader eyebrow={ctx.gym.name} title={`${greeting(ctx.gym.timezone)}, ${firstName}`} description="Here's what needs your attention today." />
      <SetupChecklist status={setup} canManageGym={ctx.permissions.has("gym.manage")} canManageStaff={ctx.permissions.has("staff.manage")} />
    </>
  );
}
