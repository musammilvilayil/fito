import { z } from "zod";
import { inGym } from "@/server/auth/context";
import { route } from "@/server/http/route";
import { listNotifications, markRead } from "@/server/modules/notifications/service";

export const GET = route({ auth: "gym" }, async ({ ctx }) => inGym(ctx, (tx) => listNotifications(tx, ctx)));

const readSchema = z.object({ ids: z.union([z.literal("all"), z.array(z.uuid()).max(100)]) });

/** Marks notifications as read: `{ ids: [...] }` or `{ ids: "all" }`. */
export const POST = route({ auth: "gym", body: readSchema }, async ({ ctx, body }) =>
  inGym(ctx, async (tx) => {
    await markRead(tx, ctx, body.ids);
    return { ok: true };
  }),
);
