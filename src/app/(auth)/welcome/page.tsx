import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession, homePathFor } from "@/server/auth/page";
import { AuthCard } from "../auth-card";
import { SignOutButton } from "./sign-out-button";

export const metadata: Metadata = { title: "No gym yet" };

/** Signed in, but not (or no longer) part of any gym. */
export default async function WelcomePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const home = await homePathFor();
  if (home !== "/welcome") redirect(home);
  return (
    <AuthCard
      title={`Hi ${session.user.fullName.split(" ")[0]}`}
      subtitle="Your account isn't linked to a gym right now. Ask your gym to send you an invite link, then open it while signed in."
    >
      <SignOutButton />
    </AuthCard>
  );
}
