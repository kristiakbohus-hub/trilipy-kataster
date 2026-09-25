import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Icon } from "./kit";
import { useRole } from "../lib/role-context";
import { useAuth } from "../lib/auth-context";
import { NotifBell } from "./collab";
import { ROLES, type AppPath, type Role } from "../lib/domain";

type NavItem = { to: AppPath; label: string; icon: string };
type NavGroup = { title?: string; collapsible?: boolean; items: NavItem[] };
// Zoskupené menu (zjednodušenie 20+ položiek → 5 sekcií). „Domov" = Dobré ráno; menej časté v zbaliteľných Nástrojoch.
const NAV_GROUPS: NavGroup[] = [
  { items: [{ to: "/rano", label: "Domov", icon: "mission" }] },
  { title: "Hľadať & deals", items: [
    { to: "/prieskum", label: "Hľadať / prieskum", icon: "target" },
    { to: "/prilezitosti", label: "ÚP príležitosti", icon: "zone" },
    { to: "/deal-radar", label: "Deal radar", icon: "target" },
    { to: "/watchlist", label: "Watchlist", icon: "target" },
    { to: "/deals", label: "Pipeline", icon: "folder" },
    { to: "/cases", label: "Cases", icon: "folder" },
  ] },
  { title: "Kataster", items: [
    { to: "/mapa", label: "Mapa / GIS", icon: "map" },
    { to: "/browser", label: "Kataster browser", icon: "table" },
    { to: "/vlastnici", label: "Vlastníci", icon: "target" },
    { to: "/datasety", label: "Datasety", icon: "database" },
    { to: "/zoning", label: "Územný plán", icon: "zone" },
  ] },
  { title: "Trh", items: [
    { to: "/ceny", label: "Trhové ceny", icon: "target" },
  ] },
  { title: "Nástroje", collapsible: true, items: [
    { to: "/import", label: "Import & intake", icon: "upload" },
    { to: "/reporty", label: "Reporty", icon: "report" },
    { to: "/pravny-referent", label: "Právny referent", icon: "report" },
    { to: "/kalibracia", label: "Kalibrácia AVM/GDV", icon: "target" },
    { to: "/aktivita", label: "Denník aktivity", icon: "report" },
    { to: "/", label: "Mission Control", icon: "mission" },
    { to: "/prehlad", label: "Prehľad / Dashboard", icon: "report" },
    { to: "/gdpr", label: "GDPR", icon: "shield" },
    { to: "/system", label: "System Status", icon: "shield" },
  ] },
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
  const [openMore, setOpenMore] = useState(false);
  const isActive = (to: string) => (to === "/" ? pathname === "/" : pathname.startsWith(to));
  const renderItem = (item: NavItem) => {
    const active = isActive(item.to);
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
  };
  return (
    <>
      {NAV_GROUPS.map((group, gi) => {
        if (group.collapsible) {
          const open = openMore || group.items.some((it) => isActive(it.to));
          return (
            <div key={gi} className="mt-2">
              <button
                type="button"
                onClick={() => setOpenMore((v) => !v)}
                className="flex w-full items-center justify-between rounded-md px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted hover:text-fg"
              >
                <span>{group.title}</span>
                <span className="text-xs">{open ? "▾" : "▸"}</span>
              </button>
              {open ? <div className="flex flex-col gap-1">{group.items.map(renderItem)}</div> : null}
            </div>
          );
        }
        return (
          <div key={gi} className={gi === 0 ? "flex flex-col gap-1" : "mt-2 flex flex-col gap-1"}>
            {group.title ? <div className="px-3 pb-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">{group.title}</div> : null}
            {group.items.map(renderItem)}
          </div>
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
  const { signOut, user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => { setMenuOpen(false); }, [pathname]); // zavri mobilné menu po prechode

  return (
    <div className="min-h-dvh bg-cream text-fg">
      {/* Sidebar (desktop) — svetlý, minimalistický (brandbook) */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-line bg-paper px-3 py-4 md:flex">
        <div className="shrink-0 px-2">
          <Brand />
        </div>
        <nav className="mt-6 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
          <NavList pathname={pathname} />
        </nav>
        <div className="mt-3 shrink-0 rounded-md border border-line bg-cream p-3 text-[11px] leading-relaxed text-muted">
          <div className="font-display mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-fg">Fakty na rovinu.</div>
          Interný pracovný nástroj. Nepodáva právne ani geodetické závery. Owner-sensitive dáta rolovo chránené.
        </div>
      </aside>

      {/* Main */}
      <div className="md:pl-60">
        <header className="sticky top-0 z-30 border-b border-line bg-cream/90 backdrop-blur">
          <div className="flex items-center gap-3 px-4 py-3 md:px-6">
            <button
              onClick={() => setMenuOpen(true)}
              aria-label="Otvoriť menu"
              className="-ml-1 rounded-md border border-line px-2.5 py-1.5 text-lg leading-none text-fg hover:bg-surface-2 md:hidden"
            >
              ☰
            </button>
            <div className="md:hidden">
              <Brand />
            </div>
            <div className="ml-auto flex items-center gap-3">
              <span className="hidden items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs font-medium text-muted sm:inline-flex">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#9a7b3e" }} />
                ready · 99%
              </span>
              {user ? <span className="hidden text-xs text-fg sm:inline" title={user.email}>{user.name ?? user.email} <span className="text-muted">· {user.role}</span></span> : null}
              <NotifBell />
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
        </header>

        <main className="mx-auto max-w-[1200px] px-4 py-6 md:px-6 md:py-8">{children}</main>
      </div>

      {/* Mobilné menu — výsuvný panel (hamburger) namiesto stlačeného horizontálneho pásu */}
      {menuOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMenuOpen(false)} aria-hidden />
          <aside className="absolute inset-y-0 left-0 flex w-[82%] max-w-xs flex-col border-r border-line bg-paper px-3 py-4 shadow-xl">
            <div className="flex shrink-0 items-center justify-between px-2">
              <Brand />
              <button onClick={() => setMenuOpen(false)} aria-label="Zavrieť menu" className="rounded-md border border-line px-2.5 py-1 text-lg leading-none text-fg hover:bg-surface-2">✕</button>
            </div>
            <nav className="mt-4 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
              <NavList pathname={pathname} onNavigate={() => setMenuOpen(false)} />
            </nav>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
