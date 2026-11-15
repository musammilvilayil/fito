import type { Metadata } from "next";
import { AssistantChat } from "@/components/assistant/chat";
import { PageHeader } from "@/components/ui/page";
import { inGym } from "@/server/auth/context";
import { requireStaffContext } from "@/server/auth/page";
import { assistantAvailability, listThreads } from "@/server/modules/assistant/service";

export const metadata: Metadata = { title: "Assistant" };

export default async function StaffAssistantPage() {
  const ctx = await requireStaffContext();
  const threads = await inGym(ctx, (tx) => listThreads(tx, ctx));
  const availability = assistantAvailability(ctx);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Assistant" description="Ask about attendance, payments, renewals, members and plans. It only sees what your role can see." />
      <AssistantChat
        variant="staff"
        initial={{ ...availability, threads: threads.map((t) => ({ id: t.id, title: t.title, updatedAt: t.updatedAt.toISOString() })) }}
      />
    </div>
  );
}
