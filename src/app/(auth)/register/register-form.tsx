"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/form";
import { api } from "@/lib/api";
import { fieldError, useApiForm } from "@/lib/use-api-form";
import { registerSchema } from "@/shared/schemas/auth";

export function RegisterForm({ needsCode }: { needsCode: boolean }) {
  const router = useRouter();
  const { form, formError, run, errors, submitting } = useApiForm(registerSchema, {
    fullName: "",
    email: "",
    phone: "",
    password: "",
    gymName: "",
    city: "",
    accessCode: "",
  });
  const reg = form.register;

  return (
    <form
      method="post"
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void run(async (values) => {
          await api("/auth/register", { body: values });
          router.replace("/dashboard");
          router.refresh();
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Gym name" htmlFor="gymName" required error={fieldError(errors, "gymName")}>
          <Input id="gymName" placeholder="Iron Paradise Fitness" aria-invalid={!!errors.gymName} {...reg("gymName")} />
        </Field>
        <Field label="City" htmlFor="city" required error={fieldError(errors, "city")}>
          <Input id="city" placeholder="Kochi" aria-invalid={!!errors.city} {...reg("city")} />
        </Field>
      </div>
      <Field label="Your name" htmlFor="fullName" required error={fieldError(errors, "fullName")}>
        <Input id="fullName" autoComplete="name" aria-invalid={!!errors.fullName} {...reg("fullName")} />
      </Field>
      <Field label="Mobile number" htmlFor="phone" error={fieldError(errors, "phone")} hint="Used to sign in">
        <Input id="phone" type="tel" autoComplete="tel" placeholder="98470 12345" aria-invalid={!!errors.phone} {...reg("phone")} />
      </Field>
      <Field label="Email" htmlFor="email" error={fieldError(errors, "email")} hint="Optional if you added a mobile number">
        <Input id="email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...reg("email")} />
      </Field>
      <Field label="Password" htmlFor="password" required error={fieldError(errors, "password")} hint="At least 8 characters">
        <Input id="password" type="password" autoComplete="new-password" aria-invalid={!!errors.password} {...reg("password")} />
      </Field>
      {needsCode && (
        <Field label="Access code" htmlFor="accessCode" required error={fieldError(errors, "accessCode")} hint="FITO is in pilot. Ask the FITO team for a code.">
          <Input id="accessCode" autoComplete="off" {...reg("accessCode")} />
        </Field>
      )}
      <FormError message={formError} />
      <Button type="submit" size="lg" className="w-full" loading={submitting}>
        Create gym account
      </Button>
    </form>
  );
}
