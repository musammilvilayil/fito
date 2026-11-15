import { AppError, serviceUnavailable } from "@/server/errors";
import { route } from "@/server/http/route";
import { assistantAvailability, runTurn, type AssistantEvent } from "@/server/modules/assistant/service";
import { chatSchema } from "@/shared/schemas/assistant";

export const maxDuration = 120;

/**
 * Sends a message to the assistant and streams the reply as Server-Sent
 * Events: `data: {json}\n\n` per event (see ChatEvent). Problems found before
 * streaming starts return normal JSON errors; later ones arrive as an
 * `error` event.
 */
export const POST = route({ auth: "gym", body: chatSchema }, async ({ ctx, body, req }) => {
  const availability = assistantAvailability(ctx);
  if (!availability.available) throw serviceUnavailable(availability.reason ?? "The assistant isn't available.");

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: AssistantEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch {
          // The client went away; the turn still finishes and is stored.
        }
      };
      try {
        await runTurn(ctx, { threadId: body.threadId ?? null, text: body.message }, send, req.signal);
      } catch (err) {
        send({
          type: "error",
          code: err instanceof AppError ? err.code : "error",
          message: err instanceof AppError ? err.message : "Something went wrong. Please try again.",
        });
      } finally {
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
});
