"use client";

import { DoorClosed, DoorOpen, Printer, RefreshCw, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { api, errorMessage } from "@/lib/api";

type Code = { url: string; svg: string };
type Kind = "entrance" | "exit";

const COPY: Record<Kind, { title: string; line: string; icon: typeof DoorOpen; tone: string }> = {
  entrance: { title: "Entrance", line: "Scan to check in", icon: DoorOpen, tone: "bg-lime-soft text-lime" },
  exit: { title: "Exit", line: "Scan to check out", icon: DoorClosed, tone: "bg-coral-soft text-[#b4462e]" },
};

/** Builds a print window from DOM nodes (never from HTML strings, apart from our own QR SVG). */
function printPosters(gymName: string, posters: { kind: Kind; code: Code }[]) {
  const w = window.open("", "_blank", "width=720,height=900");
  if (!w) {
    toast.error("Allow pop-ups for FITO to print.");
    return;
  }
  const doc = w.document;
  doc.title = `${gymName}: door QR codes`;
  const style = doc.createElement("style");
  style.textContent =
    "@page{size:A4;margin:16mm}body{font-family:system-ui,sans-serif;margin:0;color:#111}" +
    ".poster{height:250mm;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;page-break-after:always}" +
    ".poster:last-child{page-break-after:auto}.gym{font-size:20px;color:#444;margin:0}.title{font-size:64px;font-weight:800;margin:6px 0 0;letter-spacing:-1px}" +
    ".line{font-size:28px;margin:4px 0 24px}.qr svg{width:120mm;height:120mm}.help{font-size:15px;color:#555;max-width:140mm;margin-top:20px}";
  doc.head.appendChild(style);
  for (const { kind, code } of posters) {
    const p = doc.createElement("section");
    p.className = "poster";
    const gym = doc.createElement("p");
    gym.className = "gym";
    gym.textContent = gymName;
    const title = doc.createElement("h1");
    title.className = "title";
    title.textContent = COPY[kind].title.toUpperCase();
    const line = doc.createElement("p");
    line.className = "line";
    line.textContent = COPY[kind].line;
    const qr = doc.createElement("div");
    qr.className = "qr";
    const svg = new DOMParser().parseFromString(code.svg, "image/svg+xml").documentElement;
    qr.appendChild(doc.importNode(svg, true));
    const help = doc.createElement("p");
    help.className = "help";
    help.textContent = "Open your phone camera or the FITO app (Home → Scan gym QR) and point it at this code. You need to be signed in to FITO.";
    p.append(gym, title, line, qr, help);
    doc.body.appendChild(p);
  }
  setTimeout(() => w.print(), 200);
}

export function DoorPosters({ gymName, entrance, exit, canReplace }: { gymName: string; entrance: Code; exit: Code; canReplace: boolean }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const all = [
    { kind: "entrance" as const, code: entrance },
    { kind: "exit" as const, code: exit },
  ];

  async function replace() {
    setBusy(true);
    try {
      await api("/gym/scan-codes", { method: "POST", body: {} });
      toast.success("New codes ready. Print and replace both posters.");
      setConfirm(false);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {all.map(({ kind, code }) => {
          const c = COPY[kind];
          return (
            <Card key={kind} data-testid={`poster-${kind}`}>
              <CardBody className="flex flex-col items-center text-center">
                <span className={`grid size-11 place-items-center rounded-2xl ${c.tone}`}>
                  <c.icon className="size-5" />
                </span>
                <h2 className="mt-3 text-xl font-semibold tracking-tight">{c.title}</h2>
                <p className="text-sm text-ink-muted">{c.line}</p>
                <div
                  className="mt-4 w-full max-w-[240px] overflow-hidden rounded-2xl bg-white p-2 shadow-[0_10px_30px_-18px_rgb(29_70_60/0.45)] [&_svg]:h-auto [&_svg]:w-full"
                  role="img"
                  aria-label={`${c.title} QR code`}
                  // Our own SVG, generated on the server from the gym's code URL.
                  dangerouslySetInnerHTML={{ __html: code.svg }}
                />
                <a href={code.url} className="mt-3 max-w-full truncate text-[11.5px] text-ink-subtle hover:text-ink" data-testid={`url-${kind}`}>
                  {code.url}
                </a>
                <Button variant="secondary" className="mt-4" onClick={() => printPosters(gymName, [{ kind, code }])}>
                  <Printer /> Print {c.title.toLowerCase()} poster
                </Button>
              </CardBody>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-raised text-lime">
            <ShieldCheck className="size-5" />
          </span>
          <div className="min-w-0 flex-1 text-[13.5px] text-ink-muted">
            <p>
              Scanning only ever checks in <span className="font-medium text-ink">the signed-in member</span>, and only at this gym. Members with an expired plan are
              refused just like at the desk. One check-in per day; check-out needs a check-in first.
            </p>
            <p className="mt-1">If a photo of the codes is shared outside the gym, replace them. The old posters stop working at once.</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button onClick={() => printPosters(gymName, all)}>
              <Printer /> Print both
            </Button>
            {canReplace && (
              <Button variant="outline" onClick={() => setConfirm(true)}>
                <RefreshCw /> Replace codes
              </Button>
            )}
          </div>
        </CardBody>
      </Card>

      <Dialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Replace both door codes?"
        description="The printed posters stop working immediately. Print the new ones and put them up before members arrive."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button variant="danger" loading={busy} onClick={() => void replace()}>
              Replace codes
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-muted">Members don&apos;t need to do anything; they just scan the new posters.</p>
      </Dialog>
    </div>
  );
}
