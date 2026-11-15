import { inGym } from "@/server/auth/context";
import { route } from "@/server/http/route";
import { assistantAvailability, listThreads } from "@/server/modules/assistant/service";

/** Whether the assistant is available to this person, suggested questions and their recent conversations. */
export const GET = route({ auth: "gym" }, async ({ ctx }) => {
  const availability = assistantAvailability(ctx);
  const threads = await inGym(ctx, (tx) => listThreads(tx, ctx));
  return { ...availability, threads };
});
