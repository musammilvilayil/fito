import type { Metadata } from "next";
import { AuthCard } from "../../auth-card";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = { title: "Reset password", robots: { index: false } };

export default async function ResetPage({ params }: PageProps<"/reset/[token]">) {
  const { token } = await params;
  return (
    <AuthCard title="Choose a new password" subtitle="This link works once. You'll be signed out of other devices.">
      <ResetForm token={token} />
    </AuthCard>
  );
}
