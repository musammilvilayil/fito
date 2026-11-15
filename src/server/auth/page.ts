import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { resolveGymContext, type GymContext } from "./context";
import { resolveSession, SESSION_COOKIE } from "./session";

/** Session for the current page request (memoised per request). */
export const getSession = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return resolveSession(token);
});

const getResolution = cache(async () => {
  const session = await getSession();
  if (!session) return null;
  return resolveGymContext(session);
});

/** Any signed-in user with a selected gym; redirects otherwise. */
export async function requireContext(): Promise<GymContext> {
  const resolution = await getResolution();
  if (!resolution) redirect("/login");
  if (resolution.kind === "none") redirect("/welcome");
  if (resolution.kind === "select") redirect("/select-gym");
  return resolution.ctx;
}

/** Staff areas (owner, manager, trainer, front desk). Members go to their portal. */
export async function requireStaffContext(): Promise<GymContext> {
  const ctx = await requireContext();
  if (ctx.role === "member") redirect("/me");
  return ctx;
}

/** Member portal. Staff without a member profile go to the dashboard. */
export async function requireMemberContext(): Promise<GymContext & { memberId: string }> {
  const ctx = await requireContext();
  if (!ctx.memberId) redirect("/dashboard");
  return ctx as GymContext & { memberId: string };
}

/** Where a signed-in user should land. */
export async function homePathFor(): Promise<string> {
  const resolution = await getResolution();
  if (!resolution) return "/login";
  if (resolution.kind === "none") return "/welcome";
  if (resolution.kind === "select") return "/select-gym";
  return resolution.ctx.role === "member" ? "/me" : "/dashboard";
}
