import type { Metadata } from "next";
import { MemberForm } from "@/components/members/member-form";
import { PageHeader } from "@/components/ui/page";
import { AccessDenied } from "@/components/ui/states";
import { formatPhone } from "@/shared/phone";
import { hasPermission, inGym } from "@/server/auth/context";
import { requireStaffContext } from "@/server/auth/page";
import { getMember } from "@/server/modules/members/service";
import { listTrainers } from "@/server/modules/staff/service";

export const metadata: Metadata = { title: "Edit member" };

export default async function EditMemberPage({ params }: PageProps<"/members/[id]/edit">) {
  const { id } = await params;
  const ctx = await requireStaffContext();
  if (!hasPermission(ctx, "members.manage")) return <AccessDenied />;
  const [member, trainers] = await inGym(ctx, (tx) => Promise.all([getMember(tx, ctx, id), listTrainers(tx, ctx)]));
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={`Edit ${member.fullName}`} description={member.memberCode} />
      <MemberForm
        mode="edit"
        memberId={member.id}
        gymName={ctx.gym.name}
        trainers={trainers}
        canAssignTrainer={hasPermission(ctx, "members.assign_trainer")}
        initial={{
          fullName: member.fullName,
          phone: formatPhone(member.phone),
          email: member.email ?? "",
          gender: (member.gender ?? "") as never,
          dateOfBirth: member.dateOfBirth ?? "",
          address: member.address ?? "",
          emergencyContactName: member.emergencyContactName ?? "",
          emergencyContactPhone: formatPhone(member.emergencyContactPhone),
          notes: member.notes ?? "",
          joinedOn: member.joinedOn,
          assignedTrainerId: member.assignedTrainerId ?? "",
        }}
      />
    </div>
  );
}
