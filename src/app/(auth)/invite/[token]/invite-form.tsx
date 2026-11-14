"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/form";
import { api, errorMessage } from "@/lib/api";
import { fieldError, useApiForm } from "@/lib/use-api-form";
import { acceptInviteSchema } from "@/shared/schemas/auth";

export function InviteForm({
  token,
  signedInAs,
  defaultName,
  loginHint,
}: {
  token: string;
  signedInAs: string | null;
  defaultName: string;
  loginHint: string;
}) {
  const router = useRouter();
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const { form, formError, run, errors, submitting } = useApiForm(acceptInviteSchema, {
    token,
    fullName: defaultName,
    password: "",
  });

  if (signedInAs) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-ink-muted">
          You&apos;re signed in as <span className="font-medium text-ink">{signedInAs}</span>. Accept to add this gym to your account.
        </p>
        <FormError message={linkError} />
        <Button
          size="lg"
          className="w-full"
          loading={linking}
          onClick={async () => {
            setLinking(true);
            setLinkError(null);
            try {
              await api("/invites/accept", { body: { token } });
              router.replace("/go");
              router.refresh();
            } catch (err) {
              setLinkError(errorMessage(err));
              setLinking(false);
            }
          }}
        >
          Accept invite
        </Button>
      </div>
    );
  }

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void run(async (values) => {
          if (!values.password) {
            form.setError("password", { message: "Choose a password" });
            return;
          }
          await api("/invites/accept", { body: values });
          router.replace("/go");
          router.refresh();
        });
      }}
    >
      <Field label="Your name" htmlFor="fullName" error={fieldError(errors, "fullName")}>
        <Input id="fullName" autoComplete="name" {...form.register("fullName")} />
      </Field>
      <Field
        label="Choose a password"
        htmlFor="password"
        error={fieldError(errors, "password")}
        hint={`You'll sign in with ${loginHint} and this password.`}
      >
        <Input id="password" type="password" autoComplete="new-password" aria-invalid={!!errors.password} {...form.register("password")} />
      </Field>
      <FormError message={formError} />
      <Button type="submit" size="lg" className="w-full" loading={submitting}>
        Create account and join
      </Button>
    </form>
  );
}
