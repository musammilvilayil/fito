"use client";

import { KeyRound, Link2, MoreHorizontal, Pencil, UserPlus, UserX, UserCheck, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ShareLinkDialog } from "@/components/share-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormError, Input, Select } from "@/components/ui/form";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/menu";
import { Avatar } from "@/components/ui/page";
import { EmptyState } from "@/components/ui/states";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { api, errorMessage } from "@/lib/api";
import { fieldError, useApiForm } from "@/lib/use-api-form";
import { formatPhone, normalizePhone } from "@/shared/phone";
import { ROLE_LABELS, STAFF_ROLES, type Role, type StaffRole } from "@/shared/permissions";
import { staffInviteSchema, staffUpdateSchema } from "@/shared/schemas/gym";

export type StaffRow = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  role: StaffRole;
  status: "invited" | "active" | "disabled";
  specializations: string[];
  userId: string | null;
  inviteExpiresAt: string | null;
  assignedMembers: number;
};

type Share = { title: string; description: string; url: string; phone: string | null; message: string };

export function StaffManager({ staff, currentRole, currentUserId }: { staff: StaffRow[]; currentRole: Role; currentUserId: string }) {
  const router = useRouter();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editing, setEditing] = useState<StaffRow | null>(null);
  const [share, setShare] = useState<Share | null>(null);
  const manageableRoles = STAFF_ROLES.filter((r) => currentRole === "owner" || (r !== "owner" && r !== "manager"));
  const canManage = (row: StaffRow) => currentRole === "owner" || (row.role !== "owner" && row.role !== "manager");

  async function setStatus(row: StaffRow, status: "active" | "disabled") {
    try {
      await api(`/staff/${row.id}`, { method: "PATCH", body: { status } });
      toast.success(status === "disabled" ? `${row.fullName} can no longer sign in to this gym` : `${row.fullName} re-enabled`);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function newInviteLink(row: StaffRow) {
    try {
      const r = await api<{ inviteUrl: string }>(`/staff/${row.id}/invite`, { method: "POST" });
      setShare({
        title: `Invite link for ${row.fullName}`,
        description: "The previous link no longer works. This one is valid for 7 days.",
        url: r.inviteUrl,
        phone: row.phone,
        message: `Hi ${row.fullName.split(" ")[0]}, join our gym on FITO:`,
      });
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function resetLink(row: StaffRow) {
    try {
      const r = await api<{ url: string; expiresInHours: number }>(`/staff/${row.id}/reset-link`, { method: "POST" });
      setShare({
        title: `Password reset for ${row.fullName}`,
        description: `Valid once, for ${r.expiresInHours} hours.`,
        url: r.url,
        phone: row.phone,
        message: `Hi ${row.fullName.split(" ")[0]}, use this link to set a new FITO password:`,
      });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <Card>
      <CardHeader
        title="Team"
        description="Everyone who can sign in to manage this gym."
        action={
          <Button size="sm" onClick={() => setInviteOpen(true)}>
            <UserPlus /> Invite staff
          </Button>
        }
      />
      {staff.length === 0 ? (
        <EmptyState icon={Users} title="No staff yet" description="Invite your trainers and front-desk team." />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Name</TH>
              <TH>Role</TH>
              <TH className="hidden md:table-cell">Contact</TH>
              <TH className="hidden sm:table-cell">Members</TH>
              <TH>Status</TH>
              <TH className="w-10" />
            </tr>
          </THead>
          <TBody>
            {staff.map((row) => (
              <TR key={row.id}>
                <TD>
                  <div className="flex items-center gap-3">
                    <Avatar name={row.fullName} size={32} />
                    <div className="min-w-0">
                      <div className="truncate font-medium">{row.fullName}</div>
                      {row.specializations.length > 0 && (
                        <div className="truncate text-[12px] text-ink-subtle">{row.specializations.join(" · ")}</div>
                      )}
                    </div>
                  </div>
                </TD>
                <TD>
                  <Badge tone={row.role === "owner" ? "lime" : "neutral"}>{ROLE_LABELS[row.role]}</Badge>
                </TD>
                <TD className="hidden text-[13px] text-ink-muted md:table-cell">
                  {row.phone ? formatPhone(row.phone) : row.email}
                </TD>
                <TD className="tabular hidden text-ink-muted sm:table-cell">{row.role === "trainer" ? row.assignedMembers : "—"}</TD>
                <TD>
                  {row.status === "active" ? (
                    <Badge tone="success" dot>
                      Active
                    </Badge>
                  ) : row.status === "invited" ? (
                    <Badge tone="warning" dot>
                      Invited
                    </Badge>
                  ) : (
                    <Badge tone="neutral">Disabled</Badge>
                  )}
                </TD>
                <TD>
                  {canManage(row) && row.userId !== currentUserId && (
                    <Menu
                      trigger={
                        <Button variant="ghost" size="icon" aria-label={`Actions for ${row.fullName}`}>
                          <MoreHorizontal />
                        </Button>
                      }
                    >
                      <MenuItem onSelect={() => setEditing(row)}>
                        <Pencil /> Edit details &amp; role
                      </MenuItem>
                      {!row.userId && (
                        <MenuItem onSelect={() => void newInviteLink(row)}>
                          <Link2 /> New invite link
                        </MenuItem>
                      )}
                      {row.userId && (
                        <MenuItem onSelect={() => void resetLink(row)}>
                          <KeyRound /> Password reset link
                        </MenuItem>
                      )}
                      <MenuSeparator />
                      {row.status === "disabled" ? (
                        row.userId && (
                          <MenuItem onSelect={() => void setStatus(row, "active")}>
                            <UserCheck /> Re-enable access
                          </MenuItem>
                        )
                      ) : (
                        <MenuItem danger onSelect={() => void setStatus(row, "disabled")}>
                          <UserX /> Disable access
                        </MenuItem>
                      )}
                    </Menu>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      <InviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        roles={manageableRoles}
        onInvited={(result, name, phone) => {
          setInviteOpen(false);
          setShare({
            title: `${name} has been invited`,
            description: "Send them this link to create their login. It's valid for 7 days.",
            url: result.inviteUrl,
            phone,
            message: `Hi ${name.split(" ")[0]}, join our gym on FITO:`,
          });
          router.refresh();
        }}
      />
      {editing && (
        <EditDialog
          row={editing}
          roles={manageableRoles}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            toast.success("Staff details saved");
            router.refresh();
          }}
        />
      )}
      {share && <ShareLinkDialog open onOpenChange={(o) => !o && setShare(null)} {...share} />}
    </Card>
  );
}

function InviteDialog({
  open,
  onOpenChange,
  roles,
  onInvited,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  roles: StaffRole[];
  onInvited: (r: { inviteUrl: string }, name: string, phone: string | null) => void;
}) {
  const { form, formError, run, errors, submitting } = useApiForm(staffInviteSchema, {
    fullName: "",
    phone: "",
    email: "",
    role: "trainer",
    specializations: [],
  });
  const [specText, setSpecText] = useState("");
  const reg = form.register;
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) form.reset();
        onOpenChange(o);
      }}
      title="Invite staff"
      description="They'll get a link to create their own login."
    >
      <form
        noValidate
        id="invite-staff"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async (values) => {
            const specializations = specText
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            const r = await api<{ inviteUrl: string }>("/staff", { body: { ...values, specializations } });
            onInvited(r, values.fullName, normalizePhone(values.phone as string));
            form.reset();
            setSpecText("");
          });
        }}
      >
        <Field label="Full name" htmlFor="s-name" required error={fieldError(errors, "fullName")}>
          <Input id="s-name" {...reg("fullName")} aria-invalid={!!errors.fullName} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Mobile number" htmlFor="s-phone" error={fieldError(errors, "phone")}>
            <Input id="s-phone" type="tel" placeholder="98470 12345" {...reg("phone")} aria-invalid={!!errors.phone} />
          </Field>
          <Field label="Email" htmlFor="s-email" error={fieldError(errors, "email")}>
            <Input id="s-email" type="email" {...reg("email")} aria-invalid={!!errors.email} />
          </Field>
        </div>
        <Field label="Role" htmlFor="s-role" error={fieldError(errors, "role")}>
          <Select id="s-role" {...reg("role")}>
            {roles.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Specialisations" htmlFor="s-spec" hint="For trainers, comma separated: Weight loss, Strength">
          <Input id="s-spec" value={specText} onChange={(e) => setSpecText(e.target.value)} />
        </Field>
        <FormError message={formError} />
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            Create invite
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function EditDialog({
  row,
  roles,
  onClose,
  onSaved,
}: {
  row: StaffRow;
  roles: StaffRole[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { form, formError, run, errors, submitting } = useApiForm(staffUpdateSchema, {
    fullName: row.fullName,
    phone: formatPhone(row.phone),
    email: row.email ?? "",
    role: row.role,
  });
  const [specText, setSpecText] = useState(row.specializations.join(", "));
  const reg = form.register;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`Edit ${row.fullName}`}>
      <form
        noValidate
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async (values) => {
            const specializations = specText
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            await api(`/staff/${row.id}`, { method: "PATCH", body: { ...values, specializations } });
            onSaved();
          });
        }}
      >
        <Field label="Full name" htmlFor="e-name" error={fieldError(errors, "fullName")}>
          <Input id="e-name" {...reg("fullName")} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Mobile number" htmlFor="e-phone" error={fieldError(errors, "phone")}>
            <Input id="e-phone" type="tel" {...reg("phone")} />
          </Field>
          <Field label="Email" htmlFor="e-email" error={fieldError(errors, "email")}>
            <Input id="e-email" type="email" {...reg("email")} />
          </Field>
        </div>
        <Field label="Role" htmlFor="e-role" error={fieldError(errors, "role")}>
          <Select id="e-role" {...reg("role")}>
            {roles.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Specialisations" htmlFor="e-spec" hint="Comma separated">
          <Input id="e-spec" value={specText} onChange={(e) => setSpecText(e.target.value)} />
        </Field>
        <FormError message={formError} />
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
