import type { Metadata } from "next";
import { MemberForm } from "@/components/members/member-form";
import { PageHeader } from "@/components/ui/page";
import { AccessDenied } from "@/components/ui/states";
import { hasPermission, inGym } from "@/server/auth/context";
import { requireStaffContext } from "@/server/auth/page";
import { gymToday } from "@/server/modules/members/service";
import { listTrainers } from "@/server/modules/staff/service";

export const metadata: Metadata = { title: "Add member" };

export default async function NewMemberPage() {
  const ctx = await requireStaffContext();
  if (!hasPermission(ctx, "members.manage") && !hasPermission(ctx, "members.add")) return <AccessDenied />;
  const trainers = await inGym(ctx, (tx) => listTrainers(tx, ctx));
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Add member"
        description={
          hasPermission(ctx, "members.manage")
            ? "You can sell a membership right after saving."
            : "The member is assigned to you. The front desk sells the membership."
        }
      />
      <MemberForm
        mode="create"
        gymName={ctx.gym.name}
        trainers={trainers}
        canAssignTrainer={hasPermission(ctx, "members.assign_trainer")}
        initial={{
          fullName: "",
          phone: "",
          email: "",
          gender: "",
          dateOfBirth: "",
          address: "",
          emergencyContactName: "",
          emergencyContactPhone: "",
          notes: "",
          joinedOn: gymToday(ctx),
          assignedTrainerId: "",
        }}
      />
    </div>
  );
}
