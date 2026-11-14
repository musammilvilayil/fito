import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page";
import { AccessDenied } from "@/components/ui/states";
import { hasPermission, inGym } from "@/server/auth/context";
import { requireStaffContext } from "@/server/auth/page";
import { listPlans } from "@/server/modules/plans/service";
import { PlansManager } from "./plans-manager";

export const metadata: Metadata = { title: "Membership plans" };

export default async function PlansPage() {
  const ctx = await requireStaffContext();
  if (!hasPermission(ctx, "plans.manage") && !hasPermission(ctx, "memberships.manage")) return <AccessDenied />;
  const plans = await inGym(ctx, (tx) => listPlans(tx, ctx, { includeInactive: true }));
  return (
    <>
      <PageHeader title="Membership plans" description="What you sell. Price changes apply to new sales only; existing memberships keep their price." />
      <PlansManager
        canManage={hasPermission(ctx, "plans.manage")}
        plans={plans.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          durationUnit: p.durationUnit,
          durationValue: p.durationValue,
          pricePaise: p.pricePaise,
          admissionFeePaise: p.admissionFeePaise,
          isActive: p.isActive,
          activeMemberships: p.activeMemberships,
        }))}
      />
    </>
  );
}
