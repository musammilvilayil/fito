import type { Metadata } from "next";
import { inGym } from "@/server/auth/context";
import { requireMemberContext } from "@/server/auth/page";
import { gymToday } from "@/server/modules/members/service";
import { listProgress } from "@/server/modules/workouts/tracking";
import { ProgressView } from "./progress-view";

export const metadata: Metadata = { title: "Progress" };

export default async function MemberProgressPage() {
  const ctx = await requireMemberContext();
  const entries = await inGym(ctx, (tx) => listProgress(tx, ctx, ctx.memberId));
  return (
    <>
      <h1 className="mb-1 text-[22px] font-semibold tracking-tight">Progress</h1>
      <p className="mb-5 text-sm text-ink-muted">Track your weight and measurements. Your trainer can see these too.</p>
      <ProgressView memberId={ctx.memberId} entries={entries} today={gymToday(ctx)} selfUserId={ctx.user.id} />
    </>
  );
}
