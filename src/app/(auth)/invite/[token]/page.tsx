import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ROLE_LABELS, type Role } from "@/shared/permissions";
import { getSession } from "@/server/auth/page";
import { lookupInvite } from "@/server/modules/auth/service";
import { AuthCard } from "../../auth-card";
import { InviteForm } from "./invite-form";

export const metadata: Metadata = { title: "Join your gym", robots: { index: false } };

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const [invite, session] = await Promise.all([lookupInvite(token), getSession()]);

  if (!invite || invite.expired || invite.accepted) {
    const message = !invite
      ? "This invite link isn't valid. It may have been replaced by a newer one."
      : invite.accepted
        ? "This invite has already been used. Sign in with your account."
        : "This invite link has expired. Ask your gym for a new one.";
    return (
      <AuthCard title="Invite unavailable" subtitle={message}>
        <Button asChild size="lg" className="w-full">
          <Link href="/login">Go to sign in</Link>
        </Button>
      </AuthCard>
    );
  }

  const roleLabel = ROLE_LABELS[invite.role as Role] ?? invite.role;
  return (
    <AuthCard
      title={`Join ${invite.gymName}`}
      subtitle={
        invite.kind === "member"
          ? `Hi ${invite.fullName.split(" ")[0]}, create your FITO account to see your membership, workouts and check-in code.`
          : `Hi ${invite.fullName.split(" ")[0]}, you've been invited as ${roleLabel.toLowerCase()}.`
      }
    >
      <InviteForm
        token={token}
        signedInAs={session ? session.user.fullName : null}
        defaultName={invite.fullName}
        loginHint={invite.phone ? "your mobile number" : "your email"}
      />
    </AuthCard>
  );
}
