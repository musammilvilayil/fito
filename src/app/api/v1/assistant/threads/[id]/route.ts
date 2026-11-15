import { inGym } from "@/server/auth/context";
import { route } from "@/server/http/route";
import { deleteThread, getThreadView } from "@/server/modules/assistant/service";

/** One of the person's own conversations. Nobody else, including the gym owner, can open it. */
export const GET = route({ auth: "gym" }, async ({ ctx, params }) => inGym(ctx, (tx) => getThreadView(tx, ctx, params.id!)));

export const DELETE = route({ auth: "gym" }, async ({ ctx, params }) =>
  inGym(ctx, async (tx) => {
    await deleteThread(tx, ctx, params.id!);
    return { ok: true };
  }),
);
