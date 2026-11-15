import { z } from "zod";

export const chatSchema = z.object({
  threadId: z.uuid().nullable().optional(),
  message: z.string().trim().min(1, "Type a message").max(2000, "Keep it under 2,000 characters"),
});
export type ChatInput = z.input<typeof chatSchema>;

export const actionDecisionSchema = z.object({ decision: z.enum(["confirm", "cancel"]) });

/** Owner-controlled AI settings (Settings → AI). */
export const aiSettingsSchema = z.object({
  aiMonthlyLimit: z.coerce.number().int().min(0, "0 or more").max(5000, "At most 5,000"),
  assistantMembers: z.boolean(),
  assistantStaff: z.boolean(),
  assistantMonthlyMessagesPerUser: z.coerce.number().int().min(1, "At least 1").max(5000, "At most 5,000"),
});
export type AiSettingsInput = z.input<typeof aiSettingsSchema>;

/** Events streamed by POST /api/v1/assistant/chat (Server-Sent Events, one JSON object per `data:` line). */
export type ChatEvent =
  | { type: "thread"; threadId: string; title: string; notice?: string }
  | { type: "text"; delta: string }
  | { type: "replace"; text: string }
  | { type: "tool"; id: string; name: string; label: string; status: "running" | "done" | "error" }
  | { type: "action"; action: ChatAction }
  | { type: "done"; inputTokens: number; outputTokens: number }
  | { type: "error"; code: string; message: string };

export type ChatAction = { id: string; type: string; summary: string; status: "pending" | "confirmed" | "cancelled" | "failed"; error?: string };
