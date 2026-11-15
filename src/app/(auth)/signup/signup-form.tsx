"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/form";
import { api } from "@/lib/api";
import { fieldError, useApiForm } from "@/lib/use-api-form";
import { memberSignupSchema } from "@/shared/schemas/auth";

export function SignupForm() {
  const router = useRouter();
  const { form, formError, run, errors, submitting } = useApiForm(memberSignupSchema, { fullName: "", phone: "", email: "", password: "" });
  const reg = form.register;
  return (
    <form
      method="post"
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void run(async (values) => {
          await api("/auth/signup", { body: values });
          router.replace("/join");
          router.refresh();
        });
      }}
    >
      <Field label="Your name" htmlFor="fullName" required error={fieldError(errors, "fullName")}>
        <Input id="fullName" autoComplete="name" aria-invalid={!!errors.fullName} {...reg("fullName")} />
      </Field>
      <Field label="Mobile number" htmlFor="phone" required error={fieldError(errors, "phone")} hint="Used to sign in and by your gym to reach you">
        <Input id="phone" type="tel" autoComplete="tel" placeholder="98470 12345" aria-invalid={!!errors.phone} {...reg("phone")} />
      </Field>
      <Field label="Email" htmlFor="email" error={fieldError(errors, "email")} hint="Optional">
        <Input id="email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...reg("email")} />
      </Field>
      <Field label="Password" htmlFor="password" required error={fieldError(errors, "password")} hint="At least 8 characters">
        <Input id="password" type="password" autoComplete="new-password" aria-invalid={!!errors.password} {...reg("password")} />
      </Field>
      <FormError message={formError} />
      <Button type="submit" size="lg" className="w-full" loading={submitting}>
        Create account
      </Button>
    </form>
  );
}
