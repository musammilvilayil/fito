"use client";

import { ArrowUp, Check, CircleAlert, History, Loader2, Plus, Sparkles, Square, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/menu";
import { api, errorMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import type { ChatAction, ChatEvent } from "@/shared/schemas/assistant";
import { RichText } from "./rich-text";

type ToolChip = { id: string; label: string; status: "running" | "done" | "error" };
type Turn = { key: string; role: "user" | "assistant"; text: string; tools: ToolChip[]; actions: ChatAction[]; streaming?: boolean; error?: string };
type ThreadSummary = { id: string; title: string; updatedAt: string };
export type AssistantInitial = { available: boolean; reason: string | null; suggestions: string[]; threads: ThreadSummary[] };

let keySeq = 0;
const nextKey = () => `t${++keySeq}`;

export function AssistantChat({ variant, initial }: { variant: "member" | "staff"; initial: AssistantInitial }) {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [threads, setThreads] = useState<ThreadSummary[]>(initial.threads);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [turns]);

  useEffect(() => () => abortRef.current?.abort(), []);

  if (!initial.available) {
    return (
      <Card className="flex flex-col items-center gap-3 px-6 py-12 text-center">
        <span className="grid size-12 place-items-center rounded-2xl bg-raised text-ink-subtle">
          <Sparkles className="size-6" />
        </span>
        <h2 className="text-[17px] font-semibold">Assistant unavailable</h2>
        <p className="max-w-sm text-sm text-ink-muted">{initial.reason}</p>
      </Card>
    );
  }

  const update = (key: string, fn: (t: Turn) => Turn) => setTurns((all) => all.map((t) => (t.key === key ? fn(t) : t)));

  async function refreshThreads() {
    try {
      const data = await api<AssistantInitial>("/assistant");
      setThreads(data.threads);
    } catch {
      // non-critical
    }
  }

  async function send(raw: string) {
    const message = raw.trim();
    if (!message || busy) return;
    setInput("");
    setNotice(null);
    const replyKey = nextKey();
    setTurns((all) => [...all, { key: nextKey(), role: "user", text: message, tools: [], actions: [] }, { key: replyKey, role: "assistant", text: "", tools: [], actions: [], streaming: true }]);
    setBusy(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetch("/api/v1/assistant/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ threadId, message }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(body?.error?.message ?? "The assistant couldn't answer just now.");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let cut: number;
        while ((cut = buffer.indexOf("\n\n")) >= 0) {
          const chunk = buffer.slice(0, cut);
          buffer = buffer.slice(cut + 2);
          const line = chunk.split("\n").find((l) => l.startsWith("data: "));
          if (line) handle(JSON.parse(line.slice(6)) as ChatEvent, replyKey);
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        update(replyKey, (t) => ({ ...t, text: t.text || "Stopped.", streaming: false }));
      } else {
        update(replyKey, (t) => ({ ...t, streaming: false, error: (err as Error).message }));
      }
    } finally {
      update(replyKey, (t) => ({ ...t, streaming: false, tools: t.tools.map((c) => (c.status === "running" ? { ...c, status: "done" } : c)) }));
      setBusy(false);
      abortRef.current = null;
      void refreshThreads();
      inputRef.current?.focus();
    }
  }

  function handle(e: ChatEvent, replyKey: string) {
    switch (e.type) {
      case "thread":
        setThreadId(e.threadId);
        if (e.notice) setNotice(e.notice);
        break;
      case "text":
        update(replyKey, (t) => ({ ...t, text: t.text + e.delta }));
        break;
      case "replace":
        update(replyKey, (t) => ({ ...t, text: e.text }));
        break;
      case "tool":
        update(replyKey, (t) => {
          const exists = t.tools.some((c) => c.id === e.id);
          const chip = { id: e.id, label: e.label, status: e.status };
          return { ...t, tools: exists ? t.tools.map((c) => (c.id === e.id ? chip : c)) : [...t.tools, chip] };
        });
        break;
      case "action":
        update(replyKey, (t) => ({ ...t, actions: [...t.actions, e.action] }));
        break;
      case "error":
        update(replyKey, (t) => ({ ...t, error: e.message, streaming: false }));
        break;
      case "done":
        update(replyKey, (t) => ({ ...t, streaming: false }));
        break;
    }
  }

  async function open(id: string) {
    if (busy) return;
    try {
      const data = await api<{ id: string; turns: { role: "user" | "assistant"; text: string; actions: ChatAction[] }[] }>(`/assistant/threads/${id}`);
      setThreadId(data.id);
      setNotice(null);
      setTurns(data.turns.map((t) => ({ key: nextKey(), role: t.role, text: t.text, tools: [], actions: t.actions })));
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  function newChat() {
    if (busy) return;
    setThreadId(null);
    setTurns([]);
    setNotice(null);
    inputRef.current?.focus();
  }

  async function remove() {
    if (!threadId || busy) return;
    if (!window.confirm("Delete this conversation? This can't be undone.")) return;
    try {
      await api(`/assistant/threads/${threadId}`, { method: "DELETE" });
      newChat();
      await refreshThreads();
      toast.success("Conversation deleted");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function decide(action: ChatAction, decision: "confirm" | "cancel") {
    try {
      const updated = await api<ChatAction>(`/assistant/actions/${action.id}`, { body: { decision } });
      setTurns((all) => all.map((t) => ({ ...t, actions: t.actions.map((a) => (a.id === updated.id ? updated : a)) })));
      if (updated.status === "confirmed") toast.success("Saved");
      if (updated.status === "failed") toast.error(updated.error ?? "Couldn't save");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const empty = turns.length === 0;

  return (
    <div className="flex min-h-[60dvh] flex-col">
      <div className="mb-4 flex items-center gap-2">
        <Menu
          align="start"
          trigger={
            <Button variant="secondary" size="sm" disabled={busy}>
              <History /> History
            </Button>
          }
        >
          <MenuLabel>Your conversations</MenuLabel>
          {threads.length === 0 ? (
            <div className="px-2.5 py-2 text-[13px] text-ink-subtle">No conversations yet</div>
          ) : (
            threads.map((t) => (
              <MenuItem key={t.id} onSelect={() => void open(t.id)}>
                <span className="max-w-[240px] flex-1 truncate">{t.title}</span>
                {t.id === threadId && <Check className="text-lime" />}
              </MenuItem>
            ))
          )}
          {threadId && <MenuSeparator />}
          {threadId && (
            <MenuItem onSelect={() => void remove()} danger>
              <Trash2 /> Delete this conversation
            </MenuItem>
          )}
        </Menu>
        <Button variant="ghost" size="sm" onClick={newChat} disabled={busy || empty}>
          <Plus /> New chat
        </Button>
      </div>

      {notice && <p className="mb-3 rounded-xl border border-info/30 bg-info/10 px-3 py-2 text-[13px] text-ink-muted">{notice}</p>}

      <div className="flex-1 space-y-4" role="log" aria-live="polite" aria-busy={busy} aria-label="Conversation">
        {empty && (
          <div className="py-6 text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-lime-soft text-lime">
              <Sparkles className="size-6" />
            </span>
            <h2 className="mt-3 text-[17px] font-semibold">{variant === "member" ? "Ask about your training or membership" : "Ask about your gym"}</h2>
            <p className="mx-auto mt-1 max-w-sm text-[13px] text-ink-muted">
              {variant === "member"
                ? "Answers use your own FITO records. For pain or medical questions, talk to your trainer or a doctor."
                : "Answers use the FITO data your role can see. The assistant can't change anything without your confirmation."}
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {initial.suggestions.map((s) => (
                <button key={s} onClick={() => void send(s)} className="rounded-full border border-line bg-surface px-3.5 py-1.5 text-[13px] text-ink-muted hover:border-line-strong hover:text-ink">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {turns.map((t) =>
          t.role === "user" ? (
            <div key={t.key} className="flex justify-end">
              <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-lime px-3.5 py-2 text-[14px] text-lime-ink">{t.text}</div>
            </div>
          ) : (
            <div key={t.key} className="flex gap-2.5">
              <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-raised text-lime" aria-hidden>
                <Sparkles className="size-3.5" />
              </span>
              <div className="min-w-0 flex-1 space-y-2">
                {t.tools.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {t.tools.map((c) => (
                      <span key={c.id} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[12px] text-ink-subtle">
                        {c.status === "running" ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : c.status === "error" ? (
                          <CircleAlert className="size-3 text-warning" />
                        ) : (
                          <Check className="size-3 text-success" />
                        )}
                        {c.label}
                      </span>
                    ))}
                  </div>
                )}
                {t.text ? (
                  <div className="break-words text-[14px] leading-relaxed text-ink">
                    <RichText text={t.text} />
                  </div>
                ) : (
                  t.streaming && (
                    <span className="inline-flex items-center gap-2 text-[13px] text-ink-subtle">
                      <Loader2 className="size-3.5 animate-spin" /> Thinking…
                    </span>
                  )
                )}
                {t.actions.map((a) => (
                  <ActionCard key={a.id} action={a} onDecide={(d) => decide(a, d)} />
                ))}
                {t.error && (
                  <p role="alert" className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-[13px] text-danger">
                    <CircleAlert className="mt-0.5 size-4 shrink-0" /> {t.error}
                  </p>
                )}
              </div>
            </div>
          ),
        )}
        {/* Scroll target sits above the sticky composer (and the member tab bar). */}
        <div ref={endRef} className={variant === "member" ? "scroll-mb-[190px] md:scroll-mb-[130px]" : "scroll-mb-[130px]"} />
      </div>

      <form
        className={cn(
          "sticky z-20 mt-4 rounded-2xl border border-line bg-surface/95 p-2 shadow-lg shadow-black/30 backdrop-blur",
          variant === "member" ? "bottom-[calc(72px+env(safe-area-inset-bottom))] md:bottom-4" : "bottom-3",
        )}
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            aria-label="Message the assistant"
            placeholder={variant === "member" ? "Ask a question" : "Ask about your gym"}
            rows={1}
            maxLength={2000}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send(input);
              }
            }}
            className="max-h-40 min-h-10 min-w-0 flex-1 resize-none bg-transparent px-2 py-2 text-[15px] text-ink placeholder:text-ink-subtle focus:outline-none"
          />
          {busy ? (
            <Button type="button" size="icon" variant="secondary" aria-label="Stop" onClick={() => abortRef.current?.abort()}>
              <Square className="fill-current" />
            </Button>
          ) : (
            <Button type="submit" size="icon" aria-label="Send" disabled={!input.trim()}>
              <ArrowUp />
            </Button>
          )}
        </div>
        <p className="px-2 pb-0.5 pt-1 text-[11px] text-ink-subtle">AI can make mistakes. Check anything important with the gym.</p>
      </form>
    </div>
  );
}

function ActionCard({ action, onDecide }: { action: ChatAction; onDecide: (d: "confirm" | "cancel") => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const act = async (d: "confirm" | "cancel") => {
    setBusy(true);
    await onDecide(d);
    setBusy(false);
  };
  return (
    <div className="rounded-xl border border-lime/30 bg-lime-soft/40 p-3">
      <p className="text-[13.5px] font-medium text-ink">{action.summary}</p>
      {action.status === "pending" ? (
        <div className="mt-2.5 flex gap-2">
          <Button size="sm" loading={busy} onClick={() => void act("confirm")}>
            <Check /> Confirm
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void act("cancel")}>
            <X /> Cancel
          </Button>
        </div>
      ) : (
        <p className={cn("mt-1.5 text-[12.5px]", action.status === "confirmed" ? "text-success" : action.status === "failed" ? "text-danger" : "text-ink-subtle")}>
          {action.status === "confirmed" ? "Saved" : action.status === "failed" ? (action.error ?? "Couldn't save") : "Cancelled"}
        </p>
      )}
    </div>
  );
}
