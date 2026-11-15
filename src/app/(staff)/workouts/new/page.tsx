import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page";
import { AccessDenied } from "@/components/ui/states";
import { memberListQuery } from "@/shared/schemas/member";
import { hasPermission, inGym } from "@/server/auth/context";
import { requireStaffContext } from "@/server/auth/page";
import { getMember, listMembers } from "@/server/modules/members/service";
import { aiUsage } from "@/server/modules/workouts/service";
import { NewPlanForm } from "./new-plan-form";
import { sequential } from "@/server/db/tx";

export const metadata: Metadata = { title: "New workout plan" };

export default async function NewPlanPage({ searchParams }: PageProps<"/workouts/new">) {
  const ctx = await requireStaffContext();
  if (!hasPermission(ctx, "workouts.manage")) return <AccessDenied />;
  const sp = await searchParams;
  const memberId = typeof sp.member === "string" ? sp.member : null;
  const [members, selected, usage] = await inGym(ctx, (tx) =>
    sequential(
      () => listMembers(tx, ctx, memberListQuery.parse({ status: "all", pageSize: 100 })),
      () => (memberId ? getMember(tx, ctx, memberId).catch(() => null) : Promise.resolve(null)),
      () => (hasPermission(ctx, "ai.generate") ? aiUsage(tx, ctx) : Promise.resolve(null)),
    ),
  );
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="New workout plan" description="Generated plans go to review. Nothing reaches the member until a trainer approves it." />
      <NewPlanForm
        members={members.items.filter((m) => m.status === "active").map((m) => ({ id: m.id, name: m.fullName, code: m.memberCode }))}
        selected={
          selected
            ? {
                id: selected.id,
                name: selected.fullName,
                fitness: {
                  goal: selected.fitness.fitnessGoal,
                  level: selected.fitness.experienceLevel,
                  days: selected.fitness.trainingDaysPerWeek,
                  minutes: selected.fitness.sessionMinutes,
                  limitationTags: selected.fitness.limitationTags,
                  clearanceRequired: selected.fitness.medicalClearanceRequired,
                },
              }
            : null
        }
        canUseAi={hasPermission(ctx, "ai.generate")}
        aiConfigured={usage?.configured ?? false}
        aiLeft={usage ? Math.max(0, usage.limit - usage.calls) : 0}
      />
    </div>
  );
}
