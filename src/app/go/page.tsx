import { redirect } from "next/navigation";
import { homePathFor } from "@/server/auth/page";

/** Sends a signed-in user to the right home: dashboard, member portal or gym picker. */
export default async function GoPage() {
  redirect(await homePathFor());
}
