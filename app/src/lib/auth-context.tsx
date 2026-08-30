import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { login as loginFn } from "./api/kataster.functions";

// No-anonymous gate (9.26). Fráza sa validuje na serveri; klient drží len marker.
// Ide o DEMO prihlásenie — pred handoffom rotovať (blocked_for_handoff).
const KEY = "tlkc.auth";

type Ctx = {
  authed: boolean | null; // null = zisťuje sa (SSR/hydratácia)
  signIn: (passphrase: string) => Promise<boolean>;
  signOut: () => void;
};

const AuthContext = createContext<Ctx>({
  authed: null,
  signIn: async () => false,
  signOut: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setAuthed(window.localStorage.getItem(KEY) === "1");
  }, []);

  const signIn = useCallback(async (passphrase: string) => {
    const r = await loginFn({ data: { passphrase } });
    if (r.ok && typeof window !== "undefined") {
      window.localStorage.setItem(KEY, "1");
      setAuthed(true);
    }
    return r.ok;
  }, []);

  const signOut = useCallback(() => {
    if (typeof window !== "undefined") window.localStorage.removeItem(KEY);
    setAuthed(false);
  }, []);

  return <AuthContext.Provider value={{ authed, signIn, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
