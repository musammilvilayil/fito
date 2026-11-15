"use client";

import { Printer, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { api, errorMessage } from "@/lib/api";

/** The member's check-in QR, with a printable card and a way to replace a leaked code. */
export function QrCard({
  memberId,
  memberName,
  memberCode,
  gymName,
  canRegenerate,
}: {
  memberId: string;
  memberName: string;
  memberCode: string;
  gymName: string;
  canRegenerate: boolean;
}) {
  const router = useRouter();
  const [version, setVersion] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const src = `/api/v1/members/${memberId}/qr-code?v=${version}`;

  function printCard() {
    const w = window.open("", "_blank", "width=420,height=560");
    if (!w) return;
    const doc = w.document;
    doc.title = `${memberName} – check-in card`;
    const style = doc.createElement("style");
    style.textContent =
      "body{font-family:system-ui,sans-serif;margin:0;display:grid;place-items:center;min-height:100vh}" +
      ".card{border:1px solid #ccc;border-radius:16px;padding:24px;text-align:center;width:300px}" +
      "img{width:240px;height:240px}h1{font-size:18px;margin:12px 0 4px}p{margin:0;color:#555;font-size:13px}";
    doc.head.appendChild(style);
    const card = doc.createElement("div");
    card.className = "card";
    const gym = doc.createElement("p");
    gym.textContent = gymName;
    const img = doc.createElement("img");
    img.src = new URL(src, window.location.origin).toString();
    img.alt = "Check-in QR code";
    const name = doc.createElement("h1");
    name.textContent = memberName;
    const code = doc.createElement("p");
    code.textContent = `Member ID ${memberCode}`;
    card.append(gym, img, name, code);
    doc.body.appendChild(card);
    img.onload = () => w.print();
  }

  return (
    <Card>
      <CardHeader title="Check-in QR code" description="Scan at the front desk. Also shown in the member's FITO app." />
      <CardBody className="flex flex-col items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- authenticated SVG from our API */}
        <img src={src} alt={`Check-in QR code for ${memberName}`} width={180} height={180} className="rounded-xl bg-white p-1" />
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="secondary" size="sm" onClick={printCard}>
            <Printer /> Print card
          </Button>
          {canRegenerate && (
            <Button variant="ghost" size="sm" onClick={() => setConfirm(true)}>
              <RefreshCw /> New code
            </Button>
          )}
        </div>
      </CardBody>
      <Dialog
        open={confirm}
        onOpenChange={setConfirm}
        size="sm"
        title="Replace this QR code?"
        description="Use this if the code was shared or a screenshot is going around. The old code stops working immediately."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button
              loading={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api(`/members/${memberId}/qr`, { method: "POST" });
                  setVersion((v) => v + 1);
                  setConfirm(false);
                  toast.success("New QR code issued");
                  router.refresh();
                } catch (err) {
                  toast.error(errorMessage(err));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Replace code
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-muted">Print a new card or ask {memberName.split(" ")[0]} to open the FITO app.</p>
      </Dialog>
    </Card>
  );
}
