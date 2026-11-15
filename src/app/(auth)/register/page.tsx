import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, homePathFor } from "@/server/auth/page";
import { AuthCard } from "../auth-card";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Set up your gym" };

export default async function RegisterPage() {
  if (await getSession()) redirect(await homePathFor());
  const needsCode = Boolean(process.env.SIGNUP_ACCESS_CODE);
  return (
    <AuthCard
      title="Set up FITO for your gym"
      subtitle="Create your owner account. You can invite trainers and front-desk staff afterwards."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-lime hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <RegisterForm needsCode={needsCode} />
    </AuthCard>
  );
}
