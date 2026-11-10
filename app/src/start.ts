import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// BRÁNA NA SERVERI (review 2026-11-10): prihlasovacia obrazovka bola len v prehliadači a 69 zo 161
// server funkcií sa dalo volať z internetu bez prihlásenia — ich ID sú vo verejnom JS balíku.
// Každé volanie /_serverFn/* teraz musí niesť platnú session (HttpOnly cookie z /api/auth).
// Nedotýka sa: stránok (SSR nemá loadery s dátami), /api/* rout (ingesty so secretom, /api/auth)
// ani interných volaní server → server (ingesty, alerty, market) — tie nejdú cez HTTP.
const sessionGate = createMiddleware().server(async ({ request, next }) => {
  if (!new URL(request.url).pathname.startsWith("/_serverFn/")) return next();
  const { tokenFromRequest, userForToken } = await import("./lib/auth.server");
  const user = await userForToken(tokenFromRequest(request)).catch(() => null);
  if (!user) {
    return new Response(JSON.stringify({ ok: false, message: "Neprihlásený — prihlás sa znova." }), {
      status: 401,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }
  return next();
});

export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware, sessionGate],
}));
