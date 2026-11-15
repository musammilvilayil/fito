import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, homePathFor } from "@/server/auth/page";
import { AuthCard } from "../auth-card";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Create your account" };

export default async function SignupPage() {
  if (await getSession()) redirect(await homePathFor());
  return (
    <AuthCard
      title="Join your gym on FITO"
      subtitle="Create your account, then find your gym. Your gym's front desk sets up your membership."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-lime hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <SignupForm />
    </AuthCard>
  );
}
