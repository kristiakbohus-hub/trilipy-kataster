import { createFileRoute } from "@tanstack/react-router";
import { runAlertsCron } from "../lib/api/kataster.functions";

// POST /api/run-alerts — systémový alert-runner (Mac launchd cron ho volá 2×/deň).
// Auth: hlavička x-alert-secret === D1 market_meta.alert_secret (netreba Worker secret).
// Vráti { ok, checked, newTotal, messages[] } — cron pošle messages do Telegramu (tg.py).
export const Route = createFileRoute("/api/run-alerts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = request.headers.get("x-alert-secret") ?? "";
        const r = await runAlertsCron({ data: { secret } });
        return new Response(JSON.stringify(r), {
          status: r.ok ? 200 : 401,
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
