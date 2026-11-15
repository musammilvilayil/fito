"use client";

import { KeyRound, Link2, MoreHorizontal, Pencil, UserCheck, UserX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ShareLinkDialog } from "@/components/share-link";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/menu";
import { api, errorMessage } from "@/lib/api";

type Share = { title: string; description: string; url: string; message: string };

export function MemberActions({
  memberId,
  fullName,
  phone,
  status,
  hasAccount,
  gymName,
  inviteOnly = false,
}: {
  memberId: string;
  fullName: string;
  phone: string | null;
  status: "active" | "inactive";
  hasAccount: boolean;
  gymName: string;
  /** Trainers: only the app invite (no edit, reset or deactivate). */
  inviteOnly?: boolean;
}) {
  const router = useRouter();
  const [share, setShare] = useState<Share | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [busy, setBusy] = useState(false);
  const first = fullName.split(" ")[0];

  async function invite() {
    try {
      const r = await api<{ inviteUrl: string }>(`/members/${memberId}/invite`, { method: "POST" });
      setShare({
        title: `Invite ${fullName} to the FITO app`,
        description: "Valid for 7 days. Any earlier link stops working.",
        url: r.inviteUrl,
        message: `Hi ${first}, set up your ${gymName} account on FITO to see your membership, check-in code and workouts:`,
      });
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function resetLink() {
    try {
      const r = await api<{ url: string; expiresInHours: number }>(`/members/${memberId}/reset-link`, { method: "POST" });
      setShare({
        title: `Password reset for ${fullName}`,
        description: `Works once, for ${r.expiresInHours} hours.`,
        url: r.url,
        message: `Hi ${first}, use this link to set a new FITO password:`,
      });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function setStatus(next: "active" | "inactive") {
    setBusy(true);
    try {
      await api(`/members/${memberId}/status`, { body: { status: next } });
      toast.success(next === "inactive" ? `${fullName} deactivated` : `${fullName} reactivated`);
      setConfirmDeactivate(false);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (inviteOnly) {
    if (hasAccount || !phone) return null;
    return (
      <>
        <Button variant="secondary" onClick={() => void invite()}>
          <Link2 /> Invite to FITO app
        </Button>
        {share && <ShareLinkDialog open onOpenChange={(o) => !o && setShare(null)} phone={phone} {...share} />}
      </>
    );
  }

  return (
    <>
      <Button variant="secondary" onClick={() => router.push(`/members/${memberId}/edit`)}>
        <Pencil /> Edit
      </Button>
      <Menu
        trigger={
          <Button variant="secondary" size="icon" aria-label="More actions">
            <MoreHorizontal />
          </Button>
        }
      >
        {!hasAccount ? (
          <MenuItem onSelect={() => void invite()} disabled={!phone}>
            <Link2 /> {phone ? "Invite to FITO app" : "Add a phone number to invite"}
          </MenuItem>
        ) : (
          <MenuItem onSelect={() => void resetLink()}>
            <KeyRound /> Password reset link
          </MenuItem>
        )}
        <MenuSeparator />
        {status === "active" ? (
          <MenuItem danger onSelect={() => setConfirmDeactivate(true)}>
            <UserX /> Deactivate member
          </MenuItem>
        ) : (
          <MenuItem onSelect={() => void setStatus("active")}>
            <UserCheck /> Reactivate member
          </MenuItem>
        )}
      </Menu>

      <Dialog
        open={confirmDeactivate}
        onOpenChange={setConfirmDeactivate}
        title={`Deactivate ${fullName}?`}
        description="They won't be able to check in and will be hidden from active lists. Their history is kept, and you can reactivate them any time."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDeactivate(false)}>
              Cancel
            </Button>
            <Button variant="danger" loading={busy} onClick={() => void setStatus("inactive")}>
              Deactivate
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-muted">Use this for members who have left the gym.</p>
      </Dialog>

      {share && <ShareLinkDialog open onOpenChange={(o) => !o && setShare(null)} phone={phone} {...share} />}
    </>
  );
}
