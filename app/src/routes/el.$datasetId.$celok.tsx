import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getEvidencnyList } from "../lib/api/kataster.functions";
import { m2 } from "../lib/domain";
import { useRole } from "../lib/role-context";

type Content = Awaited<ReturnType<typeof getEvidencnyList>>;

export const Route = createFileRoute("/el/$datasetId/$celok")({
  head: () => ({ meta: [{ title: "Evidenčný list — TRI LIPY KATASTER CORE" }] }),
  loader: async ({ params }) => {
    const datasetId = params.datasetId;
    const celok = Number(params.celok);
    const content = await getEvidencnyList({ data: { datasetId, celok, role: "viewer" } });
    return { datasetId, celok, content };
  },
  component: ElPage,
});

function ElPage() {
  const { datasetId, celok, content: initial } = Route.useLoaderData();
  const { role } = useRole();
  const [c, setC] = useState<Content>(initial);

  useEffect(() => {
    let alive = true;
    getEvidencnyList({ data: { datasetId, celok, role } }).then((r) => alive && setC(r));
    return () => { alive = false; };
  }, [datasetId, celok, role]);

  const d = c.dataset;
  const he = (v: string | number) => String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  function download(content: string, mime: string, filename: string) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
  }
  function exportDoc() {
    const rows = c.parcels.map((p) => `<tr><td>${he(p.parcel_no)}</td><td>${m2(p.area_m2)}</td><td>${he(p.use_type ?? "—")}</td></tr>`).join("");
    const body = `<div style="border-bottom:2px solid #333;padding-bottom:8px;margin-bottom:12px"><div style="font-size:20px;font-weight:bold;letter-spacing:3px">TRI LIPY</div><div style="font-size:9px;color:#777;letter-spacing:2px">KATASTER CORE · EVIDENČNÝ LIST</div></div>`
      + `<h2 style="font-family:Georgia,serif;text-transform:uppercase">Evidenčný list — celok č. ${he(celok)}</h2>`
      + `<p style="color:#555">Katastrálne územie: <b>${he(d?.ku_name ?? "")}</b> (kód ${he(d?.ku_code ?? "")}) · ${he(d?.region ?? "")}</p>`
      + `<p><b>Užívateľ:</b> ${c.access === "full" ? he(c.uzivatel ?? "—") : "(rola nemá plný prístup)"}${c.ico ? ` · IČO ${he(c.ico)}` : ""}</p>`
      + `<table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse;width:100%;font-size:12px"><tr><th>Parcelné číslo</th><th>Výmera</th><th>Druh pozemku</th></tr>${rows}</table>`
      + `<p style="font-size:11px;color:#666;border:1px solid #ccc;padding:6px;margin-top:10px">Evidenčný list zobrazuje historického UŽÍVATEĽA C-KN parciel (nie vlastníka). Interný pracovný podklad, nie úradný výstup.</p>`;
    download("﻿" + `<html xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;color:#333}</style></head><body>${body}</body></html>`, "application/msword;charset=utf-8", `evidencny_list_${celok}.doc`);
  }
  function exportCsv() {
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const rows = [
      ["Evidenčný list — celok", String(celok)],
      ["Katastrálne územie", `${d?.ku_name ?? ""} (${d?.ku_code ?? ""})`],
      ["Užívateľ", c.access === "full" ? (c.uzivatel ?? "") : "(skryté)"],
      [""],
      ["Parcelné číslo", "Výmera (m²)", "Druh"],
      ...c.parcels.map((p) => [p.parcel_no, String(p.area_m2), p.use_type ?? ""]),
    ].map((r) => r.map(esc).join(";"));
    download("﻿" + rows.join("\r\n"), "text/csv;charset=utf-8", `evidencny_list_${celok}.csv`);
  }

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
              <div className="text-[10px] uppercase tracking-[0.22em] text-muted">Kataster Core · evidenčný list</div>
            </div>
          </div>
          <div className="text-right text-xs text-muted">celok č. {celok}</div>
        </div>

        <h1 className="mt-5 font-display text-2xl font-bold uppercase tracking-wide text-fg">Evidenčný list — celok č. {celok}</h1>
        <div className="mt-1 text-sm text-muted">
          Katastrálne územie: <span className="text-fg">{d?.ku_name ?? "—"}</span> (kód {d?.ku_code ?? "—"}) · {d?.region ?? "—"}
        </div>

        <div className="mt-3 rounded-md border px-3 py-2 text-[11px] leading-relaxed" style={{ borderColor: "#9a7b3e55", background: "#33333312", color: "#5b5b5b" }}>
          <b>Interný pracovný podklad</b> — evidenčný list zobrazuje historického <b>užívateľa</b> C-KN parciel (nie vlastníka).
          Meno užívateľa je owner-sensitive (rola: {role}, prístup: {c.access}). Nie je to úradný výstup.
        </div>

        <div className="mt-5">
          <div className="mb-1 border-b border-line pb-1 font-display text-sm font-bold uppercase tracking-wide text-fg">Užívateľ</div>
          {c.access === "full" ? (
            <div className="py-2 text-sm text-fg">{c.uzivatel ?? "—"}{c.ico ? <span className="text-muted"> · IČO {c.ico}</span> : null}{c.isCompany ? <span className="text-muted"> (PO)</span> : null}</div>
          ) : (
            <div className="rounded-md border border-line bg-surface-2/40 px-3 py-2 text-sm text-muted">Meno užívateľa rola <b className="text-fg">{role}</b> nevidí (owner-masking).</div>
          )}
        </div>

        <div className="mt-5">
          <div className="mb-1 border-b border-line pb-1 font-display text-sm font-bold uppercase tracking-wide text-fg">Parcely celku (C-KN)</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-muted">
                  <th className="px-2 py-1.5 font-medium">Parcelné číslo</th>
                  <th className="px-2 py-1.5 font-medium">Výmera</th>
                  <th className="px-2 py-1.5 font-medium">Druh pozemku</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {c.parcels.map((p, i) => (
                  <tr key={i}>
                    <td className="px-2 py-1.5 font-mono tabular-nums text-fg">{p.parcel_no}</td>
                    <td className="px-2 py-1.5 tabular-nums text-fg">{m2(p.area_m2)}</td>
                    <td className="px-2 py-1.5 text-fg">{p.use_type ?? "—"}</td>
                  </tr>
                ))}
                {c.parcels.length === 0 ? <tr><td colSpan={3} className="px-2 py-2 text-muted">Bez parciel.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-6 border-t border-line pt-3 text-[11px] text-muted">
          Vygenerované systémom <b className="text-fg">TRI LIPY KATASTER CORE</b> · evidenčný list (užívateľ) · interný pracovný výstup · neslúži na právne úkony.
        </div>
      </div>
    </div>
  );
}
