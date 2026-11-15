import { route } from "@/server/http/route";
import { decideAction } from "@/server/modules/assistant/service";
import { actionDecisionSchema } from "@/shared/schemas/assistant";

/** Confirm or cancel a change the assistant proposed. Confirming runs it with the person's own permissions. */
export const POST = route({ auth: "gym", body: actionDecisionSchema }, async ({ ctx, params, body }) => decideAction(ctx, params.id!, body.decision));
