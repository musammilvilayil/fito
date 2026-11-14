"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Checkbox, Field, FormError, Input } from "@/components/ui/form";
import { api } from "@/lib/api";
import { fieldError, useApiForm } from "@/lib/use-api-form";
import {
  EQUIPMENT_OPTIONS,
  gymProfileSchema,
  gymSettingsSchema,
  type GymProfileInput,
  type GymSettingsInput,
} from "@/shared/schemas/gym";

export function GymProfileForm({ initial }: { initial: GymProfileInput }) {
  const router = useRouter();
  const { form, formError, run, errors, submitting } = useApiForm(gymProfileSchema, initial);
  const reg = form.register;
  return (
    <Card>
      <CardHeader title="Gym profile" description="Shown on receipts, invites and the member app." />
      <CardBody>
        <form
          noValidate
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async (values) => {
              await api("/gym", { method: "PATCH", body: values });
              toast.success("Gym profile saved");
              router.refresh();
            });
          }}
        >
          <Field label="Gym name" htmlFor="name" required error={fieldError(errors, "name")} className="sm:col-span-2">
            <Input id="name" {...reg("name")} aria-invalid={!!errors.name} />
          </Field>
          <Field label="Phone" htmlFor="phone" error={fieldError(errors, "phone")}>
            <Input id="phone" type="tel" {...reg("phone")} aria-invalid={!!errors.phone} />
          </Field>
          <Field label="Email" htmlFor="email" error={fieldError(errors, "email")}>
            <Input id="email" type="email" {...reg("email")} aria-invalid={!!errors.email} />
          </Field>
          <Field label="Address" htmlFor="addressLine" error={fieldError(errors, "addressLine")} className="sm:col-span-2">
            <Input id="addressLine" placeholder="Building, street, area" {...reg("addressLine")} />
          </Field>
          <Field label="City" htmlFor="city" error={fieldError(errors, "city")}>
            <Input id="city" {...reg("city")} />
          </Field>
          <Field label="State" htmlFor="state" required error={fieldError(errors, "state")}>
            <Input id="state" {...reg("state")} />
          </Field>
          <Field label="PIN code" htmlFor="pincode" error={fieldError(errors, "pincode")}>
            <Input id="pincode" inputMode="numeric" maxLength={6} {...reg("pincode")} aria-invalid={!!errors.pincode} />
          </Field>
          <Field label="GSTIN" htmlFor="gstin" error={fieldError(errors, "gstin")} hint="Optional. Printed on receipts if set.">
            <Input id="gstin" maxLength={15} {...reg("gstin")} aria-invalid={!!errors.gstin} />
          </Field>
          <Field
            label="Receipt prefix"
            htmlFor="receiptPrefix"
            required
            error={fieldError(errors, "receiptPrefix")}
            hint="Receipts are numbered like IPF/2026-27/0001"
          >
            <Input id="receiptPrefix" maxLength={6} {...reg("receiptPrefix")} aria-invalid={!!errors.receiptPrefix} />
          </Field>
          <div className="sm:col-span-2">
            <FormError message={formError} />
          </div>
          <div className="flex justify-end sm:col-span-2">
            <Button type="submit" loading={submitting}>
              Save profile
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

export function GymSettingsForm({ initial }: { initial: GymSettingsInput }) {
  const router = useRouter();
  const { form, formError, run, errors, submitting } = useApiForm(gymSettingsSchema, initial);
  const reg = form.register;
  return (
    <Card>
      <CardHeader title="Operations" description="Rules FITO uses for reminders, check-ins and workouts." />
      <CardBody>
        <form
          noValidate
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async (values) => {
              await api("/gym/settings", { method: "PATCH", body: values });
              toast.success("Settings saved");
              router.refresh();
            });
          }}
        >
          <Field
            label="Flag memberships as expiring (days before)"
            htmlFor="expiringSoonDays"
            error={fieldError(errors, "expiringSoonDays")}
          >
            <Input id="expiringSoonDays" type="number" min={1} max={60} {...reg("expiringSoonDays")} />
          </Field>
          <Field
            label="Typical visit length (minutes)"
            htmlFor="sessionMinutes"
            error={fieldError(errors, "sessionMinutes")}
            hint="Used to estimate how many people are inside right now."
          >
            <Input id="sessionMinutes" type="number" min={15} max={480} {...reg("sessionMinutes")} />
          </Field>
          <Field label="Opening hours" htmlFor="openingHours" error={fieldError(errors, "openingHours")}>
            <Input id="openingHours" placeholder="Mon–Sat 5:00–22:00, Sun 6:00–11:00" {...reg("openingHours")} />
          </Field>
          <fieldset>
            <legend className="mb-2 text-[13px] font-medium text-ink-muted">Equipment available</legend>
            <p className="mb-3 text-[12px] text-ink-subtle">Workout suggestions only use exercises for equipment you tick.</p>
            <div className="grid grid-cols-2 gap-2.5">
              {EQUIPMENT_OPTIONS.map((eq) => (
                <Checkbox key={eq} value={eq} label={<span className="capitalize">{eq}</span>} {...reg("availableEquipment")} />
              ))}
            </div>
          </fieldset>
          <FormError message={formError} />
          <div className="flex justify-end">
            <Button type="submit" loading={submitting}>
              Save settings
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
