import { createFileRoute } from "@tanstack/react-router";
import { upDrawingAck, upDrawingQueue } from "../lib/api/kataster.functions";

// POST /api/up-drawings — výkresy ÚP z Macu (0119): {action:"publish"|"list"} alebo {action:"ack", ids, transform?}.
// Auth: hlavička x-alert-secret = kľúč Macu. Bez secretu 401.
export const Route = createFileRoute("/api/up-drawings")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = request.headers.get("x-alert-secret") ?? "";
        let body: Record<string, unknown> = {};
        try { body = (await request.json()) as Record<string, unknown>; } catch { /* prázdne telo */ }
        let r: { ok: boolean; message?: string };
        try {
          r = body.action === "ack"
            ? await upDrawingAck({ data: { ...body, secret } as never })
            : await upDrawingQueue({ data: { ...body, secret } as never });
        } catch { r = { ok: false, message: secret ? "Neplatné údaje." : "unauthorized" }; }
        return new Response(JSON.stringify(r), { status: r.ok ? 200 : r.message === "unauthorized" ? 401 : 400, headers: { "content-type": "application/json" } });
      },
    },
  },
});
