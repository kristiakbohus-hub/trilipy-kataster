// Zdieľanie klientskej verzie listu nehnuteľnosti (odkaz bez prihlásenia, 14 dní, dá sa zrušiť, počíta otvorenia).
import { useEffect, useState } from "react";
import { createPropertyShare, listPropertyShares, revokePropertyShare } from "../lib/api/kataster.functions";
import { useAuth } from "../lib/auth-context";
import type { SheetData } from "../lib/property-eval";

export function PropertyShareBox({ sheet, ready }: { sheet: SheetData; ready: boolean }) {
  const { token } = useAuth();
  const c = sheet.core;
  const kind = c.kind; const ref = kind === "byt" ? c.main.flat ?? "" : kind === "stavba" ? c.main.sc ?? "" : kind === "lv" ? String(c.main.lvNo ?? "") : `${c.main.register === "E" ? "E:" : ""}${c.main.parcelNo ?? ""}`;
  const ds = c.dataset?.id ?? "";
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listPropertyShares>>["rows"]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => { if (token && ds) listPropertyShares({ data: { token, datasetId: ds, kind, ref } }).then((r) => setRows(r.rows)).catch(() => {}); };
  useEffect(load, [token, ds, kind, ref]);
  async function make() {
    if (!token) return;
    setBusy(true);
    try {
      const r = await createPropertyShare({ data: { token, datasetId: ds, kind, ref, title: c.title, snapshot: JSON.stringify(sheet), days: 14 } });
      if (r.ok && r.path) {
        const url = `${window.location.origin}${r.path}`;
        try { await navigator.clipboard.writeText(url); setMsg(`Odkaz skopírovaný: ${url}`); } catch { setMsg(`Odkaz: ${url}`); }
        load();
      } else setMsg(r.message ?? "Odkaz sa nepodarilo vytvoriť.");
    } finally { setBusy(false); }
  }
  const live = rows.filter((x) => !x.revoked);
  return (
    <div className="rounded-lg border border-line bg-paper p-2.5 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-muted">Klientska verzia — bez mien vlastníkov a internej práce, odkaz bez prihlásenia na 14 dní.</span>
        <button onClick={() => void make()} disabled={!ready || busy} className="rounded-md border border-line px-3 py-1 text-fg hover:border-ink disabled:opacity-40">{busy ? "Vytváram…" : "Vytvoriť a skopírovať odkaz"}</button>
      </div>
      {msg ? <p className="mt-1 break-all text-green">{msg}</p> : null}
      {live.length ? (
        <ul className="mt-1 divide-y divide-line/60">{live.map((x) => (
          <li key={x.token} className="flex flex-wrap items-center justify-between gap-2 py-1">
            <span className="break-all text-muted">/n/{x.token.slice(0, 8)}… · platí do {x.expiresAt.slice(0, 10).split("-").reverse().join(". ")} · otvorené {x.views}×</span>
            <button onClick={() => { if (token) void revokePropertyShare({ data: { token, share: x.token } }).then(load); }} className="text-muted hover:text-fg">Zrušiť</button>
          </li>
        ))}</ul>
      ) : null}
    </div>
  );
}
