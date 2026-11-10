// Čítanie session tokenu pre bránu /_serverFn/* (src/start.ts) a /api/auth. Brána pustí len
// požiadavku, z ktorej vytiahne platný token — chyba tu = buď nikto sa neprihlási, alebo prejde
// podvrh. Funkcie sú v čistom module session-token.ts (bez Cloudflare/D1), takže sa dajú testovať priamo.
import { expect, test } from "bun:test";
import { clearCookie, sessionCookie, tokenFromRequest } from "../src/lib/session-token";

const T = "a".repeat(48);
const req = (headers: Record<string, string>) => new Request("https://x.test/_serverFn/abc", { method: "POST", headers });

test("token z HttpOnly cookie", () => {
  expect(tokenFromRequest(req({ cookie: `tl_session=${T}` }))).toBe(T);
  expect(tokenFromRequest(req({ cookie: `theme=dark; tl_session=${T}; x=1` }))).toBe(T);
});

test("cudzia cookie s podobným menom ani zlá dĺžka neprejde", () => {
  expect(tokenFromRequest(req({ cookie: `xtl_session=${T}` }))).toBeNull();
  expect(tokenFromRequest(req({ cookie: `tl_session=${"a".repeat(47)}` }))).toBeNull();
  expect(tokenFromRequest(req({ cookie: `tl_session=${"g".repeat(48)}` }))).toBeNull();
});

test("Bearer hlavička a token z tela (prechod starých relácií)", () => {
  expect(tokenFromRequest(req({ authorization: `Bearer ${"A".repeat(48)}` }))).toBe(T);
  expect(tokenFromRequest(req({}), T)).toBe(T);
  expect(tokenFromRequest(req({}), "nie-token")).toBeNull();
  expect(tokenFromRequest(req({}), 12345)).toBeNull();
});

test("cookie má prednosť pred telom", () => {
  const other = "b".repeat(48);
  expect(tokenFromRequest(req({ cookie: `tl_session=${T}` }), other)).toBe(T);
});

test("session cookie je HttpOnly, Secure a SameSite=Strict; odhlásenie ju zmaže", () => {
  const c = sessionCookie(T);
  expect(c).toContain(`tl_session=${T}`);
  expect(c).toContain("HttpOnly");
  expect(c).toContain("Secure");
  expect(c).toContain("SameSite=Strict");
  expect(clearCookie()).toContain("Max-Age=0");
});
