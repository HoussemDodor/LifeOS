import { z } from "zod";
import { isSignedIn } from "@/lib/require-session";
import { chatBlocked, runChatTurn, type ChatEvent } from "@/modules/finance/coach-chat";

export const dynamic = "force-dynamic";
// A turn with a few lookups takes 10–60 s; leave room.
export const maxDuration = 300;

const Body = z.object({
  chatId: z.string().uuid().nullable().optional(),
  message: z.string().trim().min(1).max(2000),
});

/** One chat turn, streamed back as newline-separated JSON events. */
export async function POST(req: Request) {
  // The middleware already requires a session; check again like every action does.
  if (!(await isSignedIn())) return Response.json({ error: "Sign in again." }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Type a question first." }, { status: 400 });
  const blocked = await chatBlocked();
  if (blocked) return Response.json({ error: blocked }, { status: 409 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const emit = (e: ChatEvent) => {
        if (!open) return; // the tab closed; keep going so the answer is still saved
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
        } catch {
          open = false;
        }
      };
      await runChatTurn(parsed.data.chatId ?? null, parsed.data.message, emit);
      if (open) controller.close();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}
