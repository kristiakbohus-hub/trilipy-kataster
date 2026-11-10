// Server-only autentifikácia: prihlásenie, registrácia, session cookie, limit pokusov.
//
// PREČO samostatný modul (review 2026-11-10): prihlasovacia brána bola len v prehliadači a 69 zo 161
// server funkcií bolo volateľných z internetu bez prihlásenia (dokumenty z R2, poznámky prípadov,
// deal pipeline, audit…). Teraz každé volanie /_serverFn/* overí session request middleware
// (src/start.ts) — a preto prihlásenie samo nemôže byť server funkcia: beží cez /api/auth.
//
// Session token ide v HttpOnly cookie (JS ho neprečíta, posiela sa automaticky, SameSite=Strict
// blokuje cudzie stránky). Kópia tokenu v localStorage ostáva len kvôli funkciám, ktoré ho majú
// v `data.token` (rola zo session) — brána sa naň nespolieha.
import { env } from "cloudflare:workers";
import type { D1Database, KVNamespace } from "@cloudflare/workers-types";
import type { Role } from "./domain";
import { SESSION_COOKIE, SESSION_MS, TOKEN_RX, clearCookie, sessionCookie, tokenFromRequest } from "./session-token";

type AuthEnv = { DB?: D1Database; KV?: KVNamespace };
const E = env as unknown as AuthEnv;

export { SESSION_COOKIE, SESSION_MS, clearCookie, sessionCookie, tokenFromRequest };
export type AuthUser = { id: string; email: string; name: string | null; role: Role };

function hexOf(buf: ArrayBuffer | Uint8Array): string {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}
function randHex(n: number): string { return hexOf(crypto.getRandomValues(new Uint8Array(n))); }
async function pbkdf2(password: string, saltHex: string): Promise<string> {
  const salt = Uint8Array.from(saltHex.match(/../g)!.map((h) => parseInt(h, 16)));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, key, 256);
  return hexOf(bits);
}

async function rows<T>(sql: string, args: unknown[] = []): Promise<T[]> {
  if (!E.DB) throw new Error("DB nedostupná");
  const r = await E.DB.prepare(sql).bind(...args).all<T>();
  return (r.results ?? []) as T[];
}
async function exec(sql: string, args: unknown[] = []): Promise<void> {
  if (!E.DB) throw new Error("DB nedostupná");
  await E.DB.prepare(sql).bind(...args).run();
}

export async function userForToken(token: string | null): Promise<AuthUser | null> {
  if (!token || !TOKEN_RX.test(token)) return null;
  const r = (await rows<{ id: string; email: string; name: string | null; role: string; expires_at: number }>(
    "SELECT u.id, u.email, u.name, u.role, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? LIMIT 1",
    [token]))[0];
  if (!r || (r.expires_at ?? 0) < Date.now()) return null;
  return { id: r.id, email: r.email, name: r.name, role: r.role as Role };
}

async function createSession(userId: string): Promise<string> {
  const token = randHex(24);
  const now = Date.now();
  await exec("INSERT INTO sessions (token,user_id,created_at,expires_at) VALUES (?,?,?,?)", [token, userId, now, now + SESSION_MS]);
  return token;
}

// ——— limit pokusov (KV, okno 15 min) ———
// Bez limitu sa dali heslá skúšať hrubou silou a každý pokus stál 100 000 iterácií PBKDF2 (aj DoS).
async function allow(key: string, limit: number): Promise<boolean> {
  if (!E.KV) return true;
  const cur = Number(await E.KV.get(key)) || 0;
  if (cur >= limit) return false;
  await E.KV.put(key, String(cur + 1), { expirationTtl: 900 });
  return true;
}

export type AuthResult = { ok: boolean; status: number; token?: string; user?: AuthUser; message?: string };
const TOO_MANY: AuthResult = { ok: false, status: 429, message: "Príliš veľa pokusov. Skús to znova o 15 minút." };

export async function authLogin(emailIn: string, password: string, ip: string): Promise<AuthResult> {
  const email = String(emailIn || "").trim().toLowerCase();
  if (!email || !password) return { ok: false, status: 400, message: "Zadaj email a heslo." };
  if (!(await allow(`rl:login:${email}`, 8)) || !(await allow(`rl:ip:${ip}`, 40))) return TOO_MANY;
  const u = (await rows<{ id: string; email: string; name: string | null; pass_hash: string; salt: string; role: string }>(
    "SELECT id,email,name,pass_hash,salt,role FROM users WHERE email = ?", [email]))[0];
  // PBKDF2 sa počíta aj pri neexistujúcom účte → z času odpovede sa nedá zistiť, či email existuje
  const h = await pbkdf2(password, u?.salt ?? "00".repeat(16));
  if (!u || h !== u.pass_hash) return { ok: false, status: 401, message: "Nesprávny email alebo heslo." };
  if (E.KV) await E.KV.delete(`rl:login:${email}`);
  const token = await createSession(u.id);
  return { ok: true, status: 200, token, user: { id: u.id, email: u.email, name: u.name, role: u.role as Role } };
}

export async function authRegister(emailIn: string, password: string, nameIn: string | undefined, ip: string): Promise<AuthResult> {
  const email = String(emailIn || "").trim().toLowerCase();
  const name = String(nameIn || "").trim() || null;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, status: 400, message: "Zadaj platný email." };
  if (String(password || "").length < 8) return { ok: false, status: 400, message: "Heslo musí mať aspoň 8 znakov." };
  if (!(await allow(`rl:reg:${ip}`, 10))) return TOO_MANY;
  // FAIL-CLOSED: predtým `catch` na AKÚKOĽVEK chybu (napr. vyčerpaný limit čítaní D1) registráciu povolil.
  const n = (await rows<{ n: number }>("SELECT COUNT(*) n FROM users"))[0]?.n ?? 0;
  if (n > 0) {
    let allowed = false;
    try {
      allowed = (await rows<{ e: string }>("SELECT email AS e FROM signup_allowlist WHERE email = ? LIMIT 1", [email])).length > 0;
    } catch {
      return { ok: false, status: 503, message: "Pozvánku sa teraz nepodarilo overiť. Skús to o chvíľu." };
    }
    if (!allowed) return { ok: false, status: 403, message: "Registrácia je len na pozvanie. Požiadaj admina, nech pridá tvoj email do prístupov." };
  }
  if ((await rows<{ id: string }>("SELECT id FROM users WHERE email = ?", [email])).length) {
    return { ok: false, status: 409, message: "Účet s týmto emailom už existuje." };
  }
  // Nový účet = VIEWER (bez mien vlastníkov); vyššiu rolu pridelí admin v karte GDPR → Používatelia.
  // Výnimka: úplne prvý účet systému je admin.
  const role: Role = n === 0 ? "admin" : "viewer";
  const salt = randHex(16);
  const id = crypto.randomUUID();
  await exec("INSERT INTO users (id,email,name,pass_hash,salt,role) VALUES (?,?,?,?,?,?)", [id, email, name, await pbkdf2(password, salt), salt, role]);
  await exec("INSERT INTO activity (user_id,author,action,detail) VALUES (?,?,?,?)", [id, name || email, "auth.register", `Nový účet ${email} (${role})`]);
  const token = await createSession(id);
  return { ok: true, status: 200, token, user: { id, email, name, role } };
}

export async function authLogout(token: string | null): Promise<void> {
  if (token && TOKEN_RX.test(token)) await exec("DELETE FROM sessions WHERE token = ?", [token]);
}
