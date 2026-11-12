import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PropertySheet } from "../components/property-sheet";
import type { SheetData } from "../lib/property-eval";

// VEREJNÝ LIST NEHNUTEĽNOSTI PRE KLIENTA (2026-11-12): /n/<token> bez prihlásenia. Dáta z /api/property-share —
// očistený snapshot z času zdieľania (bez mien vlastníkov a internej práce). Neindexovať.
export const Route = createFileRoute("/n/$token")({
  head: () => ({ meta: [{ title: "List nehnuteľnosti — TRI LIPY" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: PublicPropertyPage,
});

type Resp = { ok: boolean; message?: string; title?: string; expiresAt?: string; snapshot?: SheetData };
function PublicPropertyPage() {
  const { token } = Route.useParams();
  const [d, setD] = useState<Resp | null>(null);
  useEffect(() => {
    fetch(`/api/property-share?t=${encodeURIComponent(token)}`).then((r) => r.json() as Promise<Resp>).then(setD)
      .catch(() => setD({ ok: false, message: "List sa nepodarilo načítať." }));
  }, [token]);
  return (
    <div className="min-h-dvh bg-cream px-4 py-8 text-fg">
      {!d ? <p className="mx-auto max-w-4xl text-sm text-muted">Načítavam list nehnuteľnosti…</p>
        : !d.ok || !d.snapshot ? <div className="mx-auto max-w-4xl rounded-xl border border-line bg-paper p-6 text-sm">{d.message ?? "List nie je dostupný."}</div>
        : (
          <div className="mx-auto max-w-4xl space-y-3 rounded-xl border border-line bg-paper p-6">
            <div className="no-print flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
              <span>Odkaz platí do {(d.expiresAt ?? "").slice(0, 10).split("-").reverse().join(". ")}</span>
              <button onClick={() => window.print()} className="rounded-md bg-ink px-3 py-1.5 font-medium text-cream">Tlačiť / uložiť PDF</button>
            </div>
            <PropertySheet d={d.snapshot} mode="client" />
          </div>
        )}
    </div>
  );
}
