"use client";

import { Check, Copy, MessageCircle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { whatsappLink } from "@/shared/phone";

/** Shows a one-time link (invite or password reset) with Copy and WhatsApp share. */
export function ShareLinkDialog({
  open,
  onOpenChange,
  title,
  description,
  url,
  phone,
  message,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  url: string;
  phone?: string | null;
  message: string;
}) {
  const [copied, setCopied] = useState(false);
  const text = `${message}\n${url}`;
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title} description={description} size="md">
      <div className="space-y-4">
        <div className="break-all rounded-xl border border-line bg-raised px-3 py-3 font-mono text-[12.5px] text-ink-muted" data-testid="share-url">
          {url}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={async () => {
              await navigator.clipboard.writeText(url).catch(() => undefined);
              setCopied(true);
              setTimeout(() => setCopied(false), 1800);
            }}
          >
            {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy link"}
          </Button>
          {phone ? (
            <Button asChild className="flex-1">
              <a href={whatsappLink(phone, text)} target="_blank" rel="noreferrer">
                <MessageCircle /> Send on WhatsApp
              </a>
            </Button>
          ) : null}
        </div>
        <p className="text-[12px] text-ink-subtle">Anyone with this link can use it, so share it only with this person.</p>
      </div>
    </Dialog>
  );
}
