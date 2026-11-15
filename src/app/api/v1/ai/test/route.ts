import { route } from "@/server/http/route";
import { testAiConnection } from "@/server/modules/assistant/settings";

/** Checks the server's AI connection with one tiny request (5 per hour per gym). */
export const POST = route({ auth: "gym", permission: "gym.manage" }, async ({ ctx }) => testAiConnection(ctx));
