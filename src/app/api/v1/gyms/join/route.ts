import { joinGymSchema } from "@/shared/schemas/auth";
import { route } from "@/server/http/route";
import { joinGym } from "@/server/modules/auth/member-signup";

/** Joins a gym as a member (or switches to it if already joined) and makes it the active gym. */
export const POST = route({ auth: "user", body: joinGymSchema }, async ({ session, body }) => joinGym(session, body.gymId));
