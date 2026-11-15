import type { Metadata } from "next";
import { AssistantChat } from "@/components/assistant/chat";
import { inGym } from "@/server/auth/context";
import { requireMemberContext } from "@/server/auth/page";
import { assistantAvailability, listThreads } from "@/server/modules/assistant/service";

export const metadata: Metadata = { title: "Ask FITO" };

export default async function MemberAssistantPage() {
  const ctx = await requireMemberContext();
  const threads = await inGym(ctx, (tx) => listThreads(tx, ctx));
  const availability = assistantAvailability(ctx);
  return (
    <>
      <h1 className="mb-1 text-[22px] font-semibold tracking-tight">Ask FITO</h1>
      <p className="mb-5 text-sm text-ink-muted">Your fitness assistant for workouts, your membership and the gym.</p>
      <AssistantChat
        variant="member"
        initial={{ ...availability, threads: threads.map((t) => ({ id: t.id, title: t.title, updatedAt: t.updatedAt.toISOString() })) }}
      />
    </>
  );
}
