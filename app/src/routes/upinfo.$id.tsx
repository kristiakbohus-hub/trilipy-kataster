import { createFileRoute, Link } from "@tanstack/react-router";
import { getUpInfo } from "../lib/api/kataster.functions";

export const Route = createFileRoute("/upinfo/$id")({
  head: () => ({ meta: [{ title: "Územnoplánovacia informácia — TRI LIPY KATASTER CORE" }] }),
  loader: async ({ params }) => await getUpInfo({ data: { id: params.id } }),
  component: UpInfoPage,
});

function UpInfoPage() {
  const { row, dataset } = Route.useLoaderData();

  if (!row) {
    return (
      <div className="mx-auto max-w-[820px] p-8 text-sm text-muted">
        Záznam ÚP informácie neexistuje. <Link to="/mapa" className="text-green underline">← Mapa</Link>
      </div>
    );
  }

  const he = (v: string | number) => String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  function download(content: string, mime: string, filename: string) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
  }
  function exportDoc() {
    if (!row) return;
    const body = `<div style="border-bottom:2px solid #333;padding-bottom:8px;margin-bottom:12px"><div style="font-size:20px;font-weight:bold;letter-spacing:3px">TRI LIPY</div><div style="font-size:9px;color:#777;letter-spacing:2px">KATASTER CORE · ÚZEMNOPLÁNOVACIA INFORMÁCIA</div></div>`
      + `<h2 style="font-family:Georgia,serif;text-transform:uppercase">Územnoplánovacia informácia</h2>`
      + `<p style="color:#555">Katastrálne územie: <b>${he(dataset?.ku_name ?? "")}</b> (kód ${he(dataset?.ku_code ?? "")}) · ${he(dataset?.region ?? "")}</p>`
      + `<table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse;width:100%;font-size:13px">`
      + `<tr><td style="width:38%;background:#f2f2f2"><b>Parcela</b></td><td>${he(row.parcel_no ?? "—")}</td></tr>`
      + `<tr><td style="background:#f2f2f2"><b>Funkčná plocha</b></td><td>${he(row.functional_area ?? "—")}</td></tr>`
      + `<tr><td style="background:#f2f2f2"><b>Regulatív</b></td><td>${he(row.regulativ ?? "—")}</td></tr>`
      + `<tr><td style="background:#f2f2f2"><b>Poznámka</b></td><td>${he(row.note ?? "—")}</td></tr>`
      + `<tr><td style="background:#f2f2f2"><b>Poloha</b></td><td>${row.lat.toFixed(6)}, ${row.lng.toFixed(6)}</td></tr>`
      + `</table>`
      + `<p style="font-size:11px;color:#666;border:1px solid #ccc;padding:6px;margin-top:10px">Interný pracovný podklad — nie je to záväzné územnoplánovacie stanovisko ani právny výklad. Odvodené z georeferencovaného ÚP rastra + analytikovej interpretácie.</p>`;
    download("﻿" + `<html xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;color:#333}</style></head><body>${body}</body></html>`, "application/msword;charset=utf-8", `up_info_${row.id}.doc`);
  }
  function exportCsv() {
    if (!row) return;
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const rows = [
      ["Územnoplánovacia informácia", `${dataset?.ku_name ?? ""} (${dataset?.ku_code ?? ""})`],
      ["Parcela", row.parcel_no ?? ""],
      ["Funkčná plocha", row.functional_area ?? ""],
      ["Regulatív", row.regulativ ?? ""],
      ["Poznámka", row.note ?? ""],
      ["Poloha", `${row.lat.toFixed(6)}, ${row.lng.toFixed(6)}`],
    ].map((r) => r.map(esc).join(";"));
    download("﻿" + rows.join("\r\n"), "text/csv;charset=utf-8", `up_info_${row.id}.csv`);
  }

  const Line = ({ k, v }: { k: string; v: string }) => (
    <div className="flex gap-3 border-b border-line py-2 text-sm">
      <div className="w-40 shrink-0 text-muted">{k}</div>
      <div className="text-fg">{v}</div>
    </div>
  );

  return (
    <div className="mx-auto max-w-[820px]">
      <div className="no-print mb-4 flex items-center justify-between">
        <Link to="/mapa" className="text-xs text-muted hover:text-fg">← Mapa</Link>
        <div className="flex items-center gap-1.5">
          <button onClick={exportDoc} className="rounded-md border border-line px-2.5 py-2 text-sm font-medium text-fg hover:border-ink">Word</button>
          <button onClick={exportCsv} className="rounded-md border border-line px-2.5 py-2 text-sm font-medium text-fg hover:border-ink">CSV</button>
          <button onClick={() => { if (typeof window !== "undefined") window.print(); }} className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-cream">PDF (tlač)</button>
        </div>
      </div>

      <div className="print-doc rounded-xl border border-line bg-paper p-8">
        <div className="flex items-start justify-between border-b-2 pb-4" style={{ borderColor: "#333333" }}>
          <div className="flex items-center gap-3">
            <img src="/tl-tree.png" alt="" className="h-11 w-auto" aria-hidden />
            <div className="leading-tight">
              <div className="font-display text-lg font-bold uppercase tracking-[0.18em] text-fg">TRI LIPY</div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-muted">Kataster Core · územnoplánovacia informácia</div>
            </div>
          </div>
          <div className="text-right text-xs text-muted">{row.created_at}</div>
        </div>

        <h1 className="mt-5 font-display text-2xl font-bold uppercase tracking-wide text-fg">Územnoplánovacia informácia</h1>
        <div className="mt-1 text-sm text-muted">
          Katastrálne územie: <span className="text-fg">{dataset?.ku_name ?? "—"}</span> (kód {dataset?.ku_code ?? "—"}) · {dataset?.region ?? "—"}
        </div>

        <div className="mt-3 rounded-md border px-3 py-2 text-[11px] leading-relaxed" style={{ borderColor: "#9a7b3e55", background: "#33333312", color: "#5b5b5b" }}>
          <b>Interný pracovný podklad</b> — nie je to záväzné územnoplánovacie stanovisko ani právny výklad.
          Odvodené z georeferencovaného ÚP rastra a analytikovej interpretácie funkčnej plochy.
        </div>

        <div className="mt-5">
          <Line k="Parcela" v={row.parcel_no ?? "—"} />
          <Line k="Funkčná plocha" v={row.functional_area ?? "—"} />
          <Line k="Regulatív" v={row.regulativ ?? "—"} />
          <Line k="Poznámka" v={row.note ?? "—"} />
          <Line k="Poloha (WGS84)" v={`${row.lat.toFixed(6)}, ${row.lng.toFixed(6)}`} />
        </div>

        <div className="mt-6 border-t border-line pt-3 text-[11px] text-muted">
          Vygenerované systémom <b className="text-fg">TRI LIPY KATASTER CORE</b> · interný pracovný výstup · Tento dokument neslúži na právne úkony.
        </div>
      </div>
    </div>
  );
}
