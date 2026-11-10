// Čisté funkcie session tokenu — bez Cloudflare/D1 závislostí, aby sa dali testovať (tests/auth.test.ts).
// Používa ich brána /_serverFn/* (src/start.ts cez auth.server) aj /api/auth.
export const SESSION_COOKIE = "tl_session";
export const SESSION_MS = 30 * 24 * 3600 * 1000;
export const TOKEN_RX = /^[0-9a-f]{48}$/;          // randHex(24)

/** Token z HttpOnly cookie, inak z hlavičky Authorization, inak z tela (prechod starých relácií). */
export function tokenFromRequest(request: Request, bodyToken?: unknown): string | null {
  const cookie = request.headers.get("cookie") ?? "";
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([0-9a-f]{48})`));
  if (m) return m[1];
  const a = (request.headers.get("authorization") ?? "").match(/^Bearer\s+([0-9a-f]{48})$/i);
  if (a) return a[1].toLowerCase();
  return typeof bodyToken === "string" && TOKEN_RX.test(bodyToken) ? bodyToken : null;
}

export function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${Math.floor(SESSION_MS / 1000)}`;
}
export function clearCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}
