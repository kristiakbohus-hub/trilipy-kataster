import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Role } from "./domain";

// Demo rolový kontext. Nejde o reálnu autentifikáciu — je to ilustračný model
// rolových oprávnení (owner-sensitive gating, export, podpis) v súlade so
// stratégiou. Rola sa drží na klientovi a perzistuje v localStorage.

const DEFAULT_ROLE: Role = "analytik";
const STORAGE_KEY = "tlkc.role";

type Ctx = { role: Role; setRole: (r: Role) => void };
const RoleContext = createContext<Ctx>({ role: DEFAULT_ROLE, setRole: () => {} });

export function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<Role>(DEFAULT_ROLE);

  // Hydratácia z localStorage až v efekte (SSR-safe).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(STORAGE_KEY) as Role | null;
    if (saved) setRoleState(saved);
  }, []);

  const setRole = useCallback((r: Role) => {
    setRoleState(r);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, r);
  }, []);

  return <RoleContext.Provider value={{ role, setRole }}>{children}</RoleContext.Provider>;
}

export function useRole() {
  return useContext(RoleContext);
}
