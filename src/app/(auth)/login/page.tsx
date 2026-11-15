import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, homePathFor } from "@/server/auth/page";
import { AuthCard } from "../auth-card";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getSession()) redirect(await homePathFor());
  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in with the email or phone number your gym has on file."
      footer={
        <>
          Running a gym?{" "}
          <Link href="/register" className="font-medium text-lime hover:underline">
            Set up FITO for your gym
          </Link>
        </>
      }
    >
      <LoginForm />
      <p className="mt-5 text-[12.5px] leading-relaxed text-ink-subtle">
        Forgot your password? Ask your gym&apos;s front desk for a reset link.
      </p>
    </AuthCard>
  );
}
