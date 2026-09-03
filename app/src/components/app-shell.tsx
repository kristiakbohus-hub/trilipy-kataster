import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Icon } from "./kit";
import { useRole } from "../lib/role-context";
import { useAuth } from "../lib/auth-context";
import { ROLES, type AppPath, type Role } from "../lib/domain";

const NAV: { to: AppPath; label: string; icon: string }[] = [
  { to: "/", label: "Mission Control", icon: "mission" },
  { to: "/mapa", label: "Mapa / GIS", icon: "map" },
  { to: "/datasety", label: "Datasety", icon: "database" },
  { to: "/browser", label: "Kataster Browser", icon: "table" },
  { to: "/vlastnici", label: "Vlastníci", icon: "target" },
  { to: "/zoning", label: "Územný plán & prístup", icon: "zone" },
  { to: "/prilezitosti", label: "Príležitosti", icon: "target" },
  { to: "/prieskum", label: "NL prieskum", icon: "target" },
  { to: "/deals", label: "Deal pipeline", icon: "folder" },
  { to: "/cases", label: "Cases", icon: "folder" },
  { to: "/import", label: "Import & intake", icon: "upload" },
  { to: "/reporty", label: "Reporty", icon: "report" },
  { to: "/pravny-referent", label: "Právny referent", icon: "report" },
  { to: "/ceny", label: "Trhové ceny", icon: "target" },
  { to: "/trhova-historia", label: "Trhová história", icon: "report" },
  { to: "/system", label: "System Status", icon: "shield" },
];

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <img src="/tl-tree.png" alt="" className="h-9 w-auto" aria-hidden />
      <div className="leading-tight">
        <div className="font-display text-sm font-semibold uppercase tracking-[0.28em] text-fg">TRI LIPY</div>
        <div className="text-[9px] uppercase tracking-[0.28em] text-muted">Kataster Core</div>
      </div>
    </div>
  );
}

function NavList({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <>
      {NAV.map((item) => {
        const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={
              "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors " +
              (active ? "bg-surface-2 text-fg" : "text-muted hover:bg-surface-2/70 hover:text-fg")
            }
            style={active ? { boxShadow: "inset 2px 0 0 #333333" } : undefined}
          >
            <Icon name={item.icon} size={17} />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </>
  );
}

function RoleSwitcher() {
  const { role, setRole } = useRole();
  const current = ROLES.find((r) => r.id === role);
  return (
    <label className="flex items-center gap-2" title={current?.desc}>
      <span className="hidden text-xs text-muted sm:inline">Rola</span>
      <select
        value={role}
        onChange={(e) => setRole(e.target.value as Role)}
        className="rounded-md border border-line bg-paper px-2.5 py-1.5 text-sm text-fg outline-none focus:border-ink"
      >
        {ROLES.map((r) => (
          <option key={r.id} value={r.id}>{r.label}</option>
        ))}
      </select>
    </label>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { signOut } = useAuth();

  return (
    <div className="min-h-dvh bg-cream text-fg">
      {/* Sidebar (desktop) — svetlý, minimalistický (brandbook) */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-line bg-paper px-3 py-4 md:flex">
        <div className="px-2">
          <Brand />
        </div>
        <nav className="mt-6 flex flex-col gap-1">
          <NavList pathname={pathname} />
        </nav>
        <div className="mt-auto rounded-md border border-line bg-cream p-3 text-[11px] leading-relaxed text-muted">
          <div className="font-display mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-fg">Fakty na rovinu.</div>
          Interný pracovný nástroj. Nepodáva právne ani geodetické závery. Owner-sensitive dáta rolovo chránené.
        </div>
      </aside>

      {/* Main */}
      <div className="md:pl-60">
        <header className="sticky top-0 z-30 border-b border-line bg-cream/90 backdrop-blur">
          <div className="flex items-center gap-3 px-4 py-3 md:px-6">
            <div className="md:hidden">
              <Brand />
            </div>
            <div className="ml-auto flex items-center gap-3">
              <span className="hidden items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs font-medium text-muted sm:inline-flex">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#9a7b3e" }} />
                ready · 99%
              </span>
              <RoleSwitcher />
              <button
                onClick={signOut}
                title="Odhlásiť"
                className="rounded-md border border-line px-2.5 py-1.5 text-xs text-muted hover:bg-surface-2 hover:text-fg"
              >
                Odhlásiť
              </button>
            </div>
          </div>
          {/* Mobile nav */}
          <nav className="flex gap-1 overflow-x-auto border-t border-line px-3 py-2 md:hidden">
            <NavList pathname={pathname} />
          </nav>
        </header>

        <main className="mx-auto max-w-[1200px] px-4 py-6 md:px-6 md:py-8">{children}</main>
      </div>
    </div>
  );
}
