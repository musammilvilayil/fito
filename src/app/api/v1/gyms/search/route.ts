import { gymSearchQuery } from "@/shared/schemas/auth";
import { route } from "@/server/http/route";
import { searchJoinableGyms } from "@/server/modules/auth/member-signup";

/** Gyms the signed-in person can join from the app, by name or city. */
export const GET = route({ auth: "user", query: gymSearchQuery }, async ({ session, query }) => ({ gyms: await searchJoinableGyms(session, query.q) }));
