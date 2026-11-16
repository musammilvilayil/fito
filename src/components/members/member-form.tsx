"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ShareLinkDialog } from "@/components/share-link";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { api } from "@/lib/api";
import { fieldError, useApiForm } from "@/lib/use-api-form";
import { BATCHES, BATCH_LABELS, batchHoursLabel, type BatchHours } from "@/shared/batches";
import { normalizePhone } from "@/shared/phone";
import { GENDERS, GENDER_LABELS, memberCreateSchema, type MemberCreateInput } from "@/shared/schemas/member";

export function MemberForm({
  mode,
  memberId,
  initial,
  trainers,
  canAssignTrainer,
  gymName,
  batchHours,
  batchHint,
}: {
  mode: "create" | "edit";
  memberId?: string;
  initial: MemberCreateInput;
  trainers: { id: string; fullName: string }[];
  canAssignTrainer: boolean;
  gymName: string;
  batchHours: BatchHours;
  batchHint?: string;
}) {
  const router = useRouter();
  const { form, formError, run, errors, submitting } = useApiForm(memberCreateSchema, initial);
  const [invite, setInvite] = useState<{ id: string; url: string; phone: string | null; name: string } | null>(null);
  const reg = form.register;

  return (
    <>
      <form
        noValidate
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async (values) => {
            if (mode === "create") {
              const r = await api<{ id: string; inviteUrl: string | null }>("/members", { body: values });
              toast.success(`${values.fullName} added`);
              if (r.inviteUrl) {
                setInvite({ id: r.id, url: r.inviteUrl, phone: normalizePhone(values.phone as string), name: values.fullName as string });
              } else {
                router.push(`/members/${r.id}`);
              }
            } else {
              await api(`/members/${memberId}`, { method: "PATCH", body: values });
              toast.success("Member details saved");
              router.push(`/members/${memberId}`);
              router.refresh();
            }
          });
        }}
      >
        <Card>
          <CardHeader title="Personal details" />
          <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Full name" htmlFor="fullName" required error={fieldError(errors, "fullName")} className="sm:col-span-2">
              <Input id="fullName" autoComplete="off" {...reg("fullName")} aria-invalid={!!errors.fullName} />
            </Field>
            <Field label="Mobile number" htmlFor="phone" error={fieldError(errors, "phone")} hint="Used for sign-in, invites and WhatsApp reminders">
              <Input id="phone" type="tel" placeholder="98470 12345" {...reg("phone")} aria-invalid={!!errors.phone} />
            </Field>
            <Field label="Email" htmlFor="email" error={fieldError(errors, "email")}>
              <Input id="email" type="email" {...reg("email")} aria-invalid={!!errors.email} />
            </Field>
            <Field label="Gender" htmlFor="gender" error={fieldError(errors, "gender")}>
              <Select id="gender" {...reg("gender")}>
                <option value="">—</option>
                {GENDERS.map((g) => (
                  <option key={g} value={g}>
                    {GENDER_LABELS[g]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Date of birth" htmlFor="dateOfBirth" error={fieldError(errors, "dateOfBirth")}>
              <Input id="dateOfBirth" type="date" {...reg("dateOfBirth")} />
            </Field>
            <Field label="Address" htmlFor="address" error={fieldError(errors, "address")} className="sm:col-span-2">
              <Input id="address" {...reg("address")} />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Gym details" />
          <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Joined on" htmlFor="joinedOn" error={fieldError(errors, "joinedOn")} hint="Defaults to today">
              <Input id="joinedOn" type="date" {...reg("joinedOn")} />
            </Field>
            <Field label="Batch" htmlFor="batch" error={fieldError(errors, "batch")} hint={batchHint}>
              <Select id="batch" {...reg("batch")}>
                {BATCHES.map((b) => (
                  <option key={b} value={b}>
                    {BATCH_LABELS[b]}
                    {b !== "any" ? ` (${batchHoursLabel(b, batchHours)})` : ""}
                  </option>
                ))}
              </Select>
            </Field>
            {canAssignTrainer && (
              <Field label="Trainer" htmlFor="assignedTrainerId" error={fieldError(errors, "assignedTrainerId")}>
                <Select id="assignedTrainerId" {...reg("assignedTrainerId")}>
                  <option value="">Not assigned</option>
                  {trainers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.fullName}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label="Emergency contact name" htmlFor="emergencyContactName" error={fieldError(errors, "emergencyContactName")}>
              <Input id="emergencyContactName" {...reg("emergencyContactName")} />
            </Field>
            <Field label="Emergency contact phone" htmlFor="emergencyContactPhone" error={fieldError(errors, "emergencyContactPhone")}>
              <Input id="emergencyContactPhone" type="tel" {...reg("emergencyContactPhone")} aria-invalid={!!errors.emergencyContactPhone} />
            </Field>
            <Field label="Notes" htmlFor="notes" error={fieldError(errors, "notes")} className="sm:col-span-2" hint="Visible to staff only">
              <Textarea id="notes" rows={3} {...reg("notes")} />
            </Field>
          </CardBody>
        </Card>

        <FormError message={formError} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            {mode === "create" ? "Add member" : "Save changes"}
          </Button>
        </div>
      </form>

      {invite && (
        <ShareLinkDialog
          open
          onOpenChange={(o) => {
            if (!o) {
              router.push(`/members/${invite.id}`);
              setInvite(null);
            }
          }}
          title={`Invite ${invite.name} to the FITO app`}
          description="Optional: they'll see their membership, check-in QR code and workouts. Valid for 7 days."
          url={invite.url}
          phone={invite.phone}
          message={`Hi ${invite.name.split(" ")[0]}, welcome to ${gymName}! Set up your FITO account here:`}
        />
      )}
    </>
  );
}
