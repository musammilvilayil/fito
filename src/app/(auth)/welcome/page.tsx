import type { Metadata } from "next";
import Link from "next/link";
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
      subtitle="Your account isn't linked to a gym yet. Find your gym and join it, or open the invite link your gym sent you."
    >
      <div className="space-y-3">
        <Link href="/join" className="flex h-12 w-full items-center justify-center rounded-xl bg-lime text-[15px] font-medium text-lime-ink hover:bg-lime-hover">
          Find your gym
        </Link>
        <SignOutButton />
      </div>
    </AuthCard>
  );
}
