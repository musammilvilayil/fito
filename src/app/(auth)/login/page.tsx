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
      subtitle="Sign in with your mobile number or email."
      footer={
        <div className="space-y-1.5">
          <div>
            New to FITO?{" "}
            <Link href="/signup" className="font-medium text-lime hover:underline">
              Create a member account
            </Link>
          </div>
          <div>
            Running a gym?{" "}
            <Link href="/register" className="font-medium text-lime hover:underline">
              Set up FITO for your gym
            </Link>
          </div>
        </div>
      }
    >
      <LoginForm />
      <p className="mt-5 text-[12.5px] leading-relaxed text-ink-subtle">
        Forgot your password? Ask your gym&apos;s front desk for a reset link.
      </p>
    </AuthCard>
  );
}
