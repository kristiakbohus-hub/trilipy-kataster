import { createContext, useContext, type ReactNode } from "react";
import { useAuth } from "./auth-context";
import type { Role } from "./domain";

// Rola pre ROZHRANIE (čo ukázať) = rola prihláseného účtu z /api/auth (users.role v D1).
//
// Predtým to bol demo kontext s rolou v localStorage a predvolenou „analytik": prepínač sa už nikde
// nepoužíval, takže každý — aj nový viewer — videl rozhranie analytika (export, pipeline) a server
// mu to potom odmietol, a admin nevidel admin prvky (review 2026-11-10). Autorizácia je aj tak
// výlučne na serveri (rola zo session); tu ide len o to, aby UI ukazovalo to, čo účet naozaj smie.
// Rolu mení admin v GDPR → Používatelia a roly; zmena sa prejaví po ďalšom načítaní appky.

type Ctx = { role: Role; setRole: (r: Role) => void };
const RoleContext = createContext<Ctx>({ role: "viewer", setRole: () => {} });

export function RoleProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const role: Role = user?.role ?? "viewer";
  // setRole ostáva kvôli kompatibilite volajúcich, ale rolu na klientovi meniť nejde (nemá to význam).
  return <RoleContext.Provider value={{ role, setRole: () => {} }}>{children}</RoleContext.Provider>;
}

export function useRole() {
  return useContext(RoleContext);
}
