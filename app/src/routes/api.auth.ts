import { createFileRoute } from "@tanstack/react-router";
import { authLogin, authLogout, authRegister, clearCookie, sessionCookie, tokenFromRequest, totpDisable, totpEnable, totpSetup, totpStatus, userForToken } from "../lib/auth.server";

// POST /api/auth  { action: "login" | "register" | "me" | "logout", ... }
// Prihlásenie NEMÔŽE byť server funkcia: každé volanie /_serverFn/* overuje session request middleware
// (src/start.ts), takže bez session by sa nedalo prihlásiť. Odpoveď nastaví/zmaže HttpOnly cookie.
// „me" overí token z cookie alebo z tela (starší používatelia majú token len v localStorage)
// a cookie dosadí — prechod na novú bránu je tak pre prihlásených bez odhlásenia.
export const Route = createFileRoute("/api/auth")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { action?: string; email?: string; password?: string; name?: string; token?: string; otp?: string } = {};
        try { body = (await request.json()) as typeof body; } catch { /* prázdne telo */ }
        const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
        const json = (obj: unknown, status = 200, cookie?: string) =>
          new Response(JSON.stringify(obj), {
            status,
            headers: { "content-type": "application/json", "cache-control": "no-store", ...(cookie ? { "set-cookie": cookie } : {}) },
          });
        switch (body.action) {
          case "login":
          case "register": {
            const r = body.action === "login"
              ? await authLogin(body.email ?? "", body.password ?? "", ip, body.otp)
              : await authRegister(body.email ?? "", body.password ?? "", body.name, ip);
            return json({ ok: r.ok, token: r.token, user: r.user, message: r.message, need2fa: r.need2fa }, r.status, r.ok && r.token ? sessionCookie(r.token) : undefined);
          }
          // druhý faktor (bod 29): stav / začať / potvrdiť / vypnúť — len prihlásený používateľ (cookie)
          case "2fa-status":
          case "2fa-setup":
          case "2fa-enable":
          case "2fa-disable": {
            const u = await userForToken(tokenFromRequest(request, body.token));
            if (!u) return json({ ok: false, message: "Neprihlásený." }, 401);
            if (body.action === "2fa-status") return json({ ok: true, enabled: await totpStatus(u) });
            if (body.action === "2fa-setup") return json({ ok: true, ...(await totpSetup(u)) });
            const ok = body.action === "2fa-enable" ? await totpEnable(u, body.otp ?? "") : await totpDisable(u, body.otp ?? "");
            return json({ ok, message: ok ? undefined : "Kód nesedí." }, ok ? 200 : 400);
          }
          case "me": {
            const t = tokenFromRequest(request, body.token);
            const u = await userForToken(t);
            return u && t ? json({ ok: true, user: u }, 200, sessionCookie(t)) : json({ ok: false }, 401, clearCookie());
          }
          case "logout": {
            await authLogout(tokenFromRequest(request, body.token));
            return json({ ok: true }, 200, clearCookie());
          }
          default:
            return json({ ok: false, message: "Neznáma akcia." }, 400);
        }
      },
    },
  },
});
