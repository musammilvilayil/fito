import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/server/auth/page";
import { DoorScan } from "./door-scan";

export const metadata: Metadata = { title: "Gym check-in", robots: { index: false } };

/**
 * The link inside the QR posted at a gym's entrance or exit. Opening it
 * (phone camera or the FITO scanner) checks the signed-in member in or out.
 * The check-in itself is a POST from the page, so link previews and
 * prefetching never record a visit.
 */
export default async function DoorScanPage({ params }: PageProps<"/s/[token]">) {
  const { token } = await params;
  if (!(await getSession())) redirect(`/login?next=${encodeURIComponent(`/s/${token}`)}`);
  return <DoorScan token={token} />;
}
