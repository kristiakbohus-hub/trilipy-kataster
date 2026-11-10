import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { AuthUser } from "./auth.server";

// Reálne účty (email+heslo) cez POST /api/auth. Server nastaví HttpOnly cookie, ktorú overuje brána
// pre všetky server funkcie (src/start.ts). Kópia tokenu v localStorage ostáva pre funkcie, ktoré
// berú `data.token` (rola zo session); pri štarte „me" dosadí cookie aj starším reláciám.
const TOKEN_KEY = "tlkc.token";

type AuthResp = { ok: boolean; token?: string; user?: AuthUser; message?: string };
async function authCall(body: Record<string, unknown>): Promise<AuthResp> {
  try {
    const r = await fetch("/api/auth", {
      method: "POST", credentials: "same-origin",
      headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    return (await r.json()) as AuthResp;
  } catch {
    return { ok: false, message: "Server je nedostupný. Skús to znova." };
  }
}

type Ctx = {
  user: AuthUser | null;
  authed: boolean | null;   // null = zisťuje sa (SSR/hydratácia)
  token: string | null;
  signIn: (email: string, password: string) => Promise<{ ok: boolean; message?: string }>;
  register: (email: string, password: string, name: string) => Promise<{ ok: boolean; message?: string }>;
  signOut: () => void;
};

const AuthContext = createContext<Ctx>({
  user: null, authed: null, token: null,
  signIn: async () => ({ ok: false }),
  register: async () => ({ ok: false }),
  signOut: () => {},
});

function readToken(): string | null {
  if (typeof window === "undefined") return null;
  try { return window.localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const t = readToken();
    setToken(t);
    if (!t) { setAuthed(false); return; }
    authCall({ action: "me", token: t })
      .then((r) => {
        const u = r.ok ? r.user ?? null : null;
        setUser(u); setAuthed(!!u);
        if (!u) { try { window.localStorage.removeItem(TOKEN_KEY); } catch { /* noop */ } }
      })
      .catch(() => setAuthed(false));
  }, []);

  const persist = useCallback((t: string, u: AuthUser) => {
    try { window.localStorage.setItem(TOKEN_KEY, t); } catch { /* noop */ }
    setToken(t); setUser(u); setAuthed(true);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const r = await authCall({ action: "login", email, password });
    if (r.ok && r.token && r.user) persist(r.token, r.user);
    return { ok: r.ok, message: r.message };
  }, [persist]);

  const register = useCallback(async (email: string, password: string, name: string) => {
    const r = await authCall({ action: "register", email, password, name });
    if (r.ok && r.token && r.user) persist(r.token, r.user);
    return { ok: r.ok, message: r.message };
  }, [persist]);

  const signOut = useCallback(() => {
    const t = readToken();
    void authCall({ action: "logout", token: t });
    try { window.localStorage.removeItem(TOKEN_KEY); } catch { /* noop */ }
    setToken(null); setUser(null); setAuthed(false);
  }, []);

  return <AuthContext.Provider value={{ user, authed, token, signIn, register, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
