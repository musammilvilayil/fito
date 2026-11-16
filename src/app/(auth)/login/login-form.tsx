"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/form";
import { api } from "@/lib/api";
import { fieldError, useApiForm } from "@/lib/use-api-form";
import { loginSchema } from "@/shared/schemas/auth";

export function LoginForm({ next = null }: { next?: string | null }) {
  const router = useRouter();
  const { form, formError, run, errors, submitting } = useApiForm(loginSchema, { identifier: "", password: "" });

  return (
    <form
      method="post"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void run(async (values) => {
          await api("/auth/login", { body: values });
          router.replace(next ?? "/go");
          router.refresh();
        });
      }}
      className="space-y-4"
    >
      <Field label="Email or phone" htmlFor="identifier" error={fieldError(errors, "identifier")}>
        <Input
          id="identifier"
          autoComplete="username"
          inputMode="email"
          placeholder="you@example.com or 98470 12345"
          aria-invalid={Boolean(errors.identifier)}
          {...form.register("identifier")}
        />
      </Field>
      <Field label="Password" htmlFor="password" error={fieldError(errors, "password")}>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={Boolean(errors.password)}
          {...form.register("password")}
        />
      </Field>
      <FormError message={formError} />
      <Button type="submit" size="lg" className="w-full" loading={submitting}>
        Sign in
      </Button>
    </form>
  );
}
