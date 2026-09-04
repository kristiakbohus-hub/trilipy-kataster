import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { getLvVypis, lookupRpo, lookupRpvs } from "../lib/api/kataster.functions";
import { m2, marketValueEur } from "../lib/domain";
import { useRole } from "../lib/role-context";
import type { Role } from "../lib/domain";
import { LegalRef } from "../components/legal-ref";

type Content = Awaited<ReturnType<typeof getLvVypis>>;
type DocType = "vypis" | "el";

const eur = (n: number) => n.toLocaleString("sk-SK", { maximumFractionDigits: n < 100 ? 2 : 0 });

export const Route = createFileRoute("/vypis/$datasetId/$lvNo")({
  head: () => ({ meta: [{ title: "Výpis z LV / evidenčný list — TRI LIPY KATASTER CORE" }] }),
  validateSearch: (s: Record<string, unknown>): { typ: DocType } => ({
    typ: s.typ === "el" ? "el" : "vypis",
  }),
  loader: async ({ params }) => {
    const datasetId = params.datasetId;
    const lvNo = Number(params.lvNo);
    const content = await getLvVypis({ data: { datasetId, lvNo, role: "viewer" } });
    return { datasetId, lvNo, content };
  },
  component: VypisPage,
});

function VypisPage() {
  const { datasetId, lvNo, content: initial } = Route.useLoaderData();
  const { typ } = Route.useSearch();
  const { role } = useRole();
  const [c, setC] = useState<Content>(initial);
  const [docType, setDocType] = useState<DocType>(typ);
  const [parts, setParts] = useState({ A: true, B: true, C: true });

  useEffect(() => {
    let alive = true;
    getLvVypis({ data: { datasetId, lvNo, role } }).then((r) => alive && setC(r));
    return () => { alive = false; };
  }, [datasetId, lvNo, role]);

  const d = c.dataset;
  const isEl = docType === "el";
  const partial = !isEl && !(parts.A && parts.B && parts.C);
  const togglePart = (k: "A" | "B" | "C") => setParts((p) => ({ ...p, [k]: !p[k] }));

  function exportCsv() {
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const rows: string[] = [];
    rows.push([isEl ? "Register E" : "Výpis z LV", `č. ${lvNo}`].map(esc).join(";"));
    rows.push(["Katastrálne územie", `${d?.ku_name ?? ""} (${d?.ku_code ?? ""})`].map(esc).join(";"));
    rows.push("");
    const parcels = isEl ? c.parcelsE : c.parcelsC;
    rows.push(["Register", "Parcelné číslo", "Výmera (m2)", "Druh pozemku", "Umiestnenie"].map(esc).join(";"));
    for (const p of parcels) rows.push([p.register === "E" ? "E-KN" : "C-KN", p.parcel_no, p.area_m2, p.drp_text ?? "", p.placement ?? ""].map(esc).join(";"));
    if (!isEl) for (const p of c.parcelsE) rows.push(["E-KN", p.parcel_no, p.area_m2, p.drp_text ?? "", p.placement ?? ""].map(esc).join(";"));
    if (!isEl && c.buildings.length) {
      rows.push(""); rows.push(["Stavby", "Na parcele"].map(esc).join(";"));
      for (const b of c.buildings) rows.push([b.descr, b.on_parcel ?? ""].map(esc).join(";"));
    }
    if (!isEl) {
      const odn = c.parcelsC.filter((p) => p.sadzba != null);
      if (odn.length) {
        rows.push(""); rows.push(["Odňatie pôdy — parcela", "BPEJ skupina", "Sadzba €/m2", "Trvalé €", "Dočasné €/rok"].map(esc).join(";"));
        for (const p of odn) rows.push([p.parcel_no, p.skupina ?? "", p.sadzba ?? "", (p.odnatie_trvale ?? 0).toFixed(2), (p.odnatie_docasne ?? 0).toFixed(2)].map(esc).join(";"));
        rows.push(["Spolu", "", "", c.odnatie.trvale.toFixed(2), c.odnatie.docasne.toFixed(2)].map(esc).join(";"));
      }
      if (c.evidencne.length) {
        rows.push(""); rows.push(["Evidenčný list — celok", "Užívateľ", "IČO", "Parcely C-KN"].map(esc).join(";"));
        for (const e of c.evidencne) rows.push([e.celok, c.access === "full" ? (e.uzivatel ?? "") : "(skryté)", e.ico ?? "", e.parcels.join(" ")].map(esc).join(";"));
      }
    }
    rows.push("");
    if (c.access === "full") {
      rows.push([`Kat. územie ${d?.ku_name ?? ""}`, `LV ${lvNo}`, `Celková výmera C (m2): ${c.totalAreaC}`].map(esc).join(";"));
      rows.push(["P.č.", "Vlastník", "Titul", "Rodné priezvisko", "Dátum narodenia", "Adresa", "IČO", "Podiel", "Výmera podľa podielu (m2)"].map(esc).join(";"));
      c.owners.forEach((o, i) => { const f = shareFrac(o.share); rows.push([i + 1, o.name, o.title ?? "", o.born_name ?? "", o.birth_date ?? "", ownerAddr(o), o.ico ?? "", o.share ?? "", f != null ? Math.round(c.totalAreaC * f) : ""].map(esc).join(";")); });
      if (c.tarchy.length) { rows.push(""); rows.push(esc("Ťarchy")); for (const t of c.tarchy) rows.push(esc(t)); }
    } else {
      rows.push(["Vlastníci", `${c.count} (mená skryté — rola nemá plný prístup)`].map(esc).join(";"));
    }
    const csv = "﻿" + rows.join("\r\n");
    download(csv, "text/csv;charset=utf-8", `${isEl ? "evidencny_list" : "vypis_lv"}_${lvNo}.csv`);
  }

  function download(content: string, mime: string, filename: string) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    a.click(); URL.revokeObjectURL(url);
  }

  const he = (v: string | number) => String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  function docModel() {
    const parcelsA = isEl ? c.parcelsE : c.parcelsC;
    return { parcelsA, buildings: isEl ? [] : c.buildings };
  }

  // Excel (HTML-table .xls, dep-free — Excel ho otvorí natívne)
  function exportXls() {
    const { parcelsA, buildings } = docModel();
    let t = `<table border="1"><tr><th colspan="5">${he(isEl ? "Register E" : "Výpis z LV")} č. ${lvNo} — ${he(d?.ku_name ?? "")} (${he(d?.ku_code ?? "")})</th></tr>`;
    t += `<tr><th>Register</th><th>Parcelné číslo</th><th>Výmera (m²)</th><th>Druh pozemku</th><th>Umiestnenie</th></tr>`;
    for (const p of parcelsA) t += `<tr><td>${p.register === "E" ? "E-KN" : "C-KN"}</td><td>${he(p.parcel_no)}</td><td>${p.area_m2}</td><td>${he(p.drp_text ?? "")}</td><td>${he(p.placement ?? "")}</td></tr>`;
    if (!isEl && c.parcelsE.length) {
      t += `<tr><th colspan="5">Parcely registra „E" (pozemkovoknižný stav)</th></tr>`;
      for (const p of c.parcelsE) t += `<tr><td>E-KN</td><td>${he(p.parcel_no)}</td><td>${p.area_m2}</td><td>${he(p.drp_text ?? "")}</td><td>${he(p.placement ?? "")}</td></tr>`;
    }
    if (buildings.length) { t += `<tr><th colspan="5">Stavby</th></tr>`; for (const b of buildings) t += `<tr><td colspan="4">${he(b.descr)}</td><td>${he(b.on_parcel ?? "")}</td></tr>`; }
    if (!isEl) {
      const odn = c.parcelsC.filter((p) => p.sadzba != null);
      if (odn.length) {
        t += `<tr><th colspan="5">Odňatie poľnohospodárskej pôdy (NV 58/2013)</th></tr><tr><th>Parcela</th><th>BPEJ skupina</th><th>Sadzba €/m²</th><th>Trvalé €</th><th>Dočasné €/rok</th></tr>`;
        for (const p of odn) t += `<tr><td>${he(p.parcel_no)}</td><td>${p.skupina ?? ""}</td><td>${p.sadzba ?? ""}</td><td>${(p.odnatie_trvale ?? 0).toFixed(2)}</td><td>${(p.odnatie_docasne ?? 0).toFixed(2)}</td></tr>`;
        t += `<tr><td><b>Spolu</b></td><td></td><td></td><td><b>${c.odnatie.trvale.toFixed(2)}</b></td><td><b>${c.odnatie.docasne.toFixed(2)}</b></td></tr>`;
      }
      if (c.evidencne.length) {
        t += `<tr><th colspan="5">Evidenčný list / užívateľ</th></tr><tr><th>Celok</th><th colspan="2">Užívateľ</th><th>IČO</th><th>Parcely</th></tr>`;
        for (const e of c.evidencne) t += `<tr><td>${e.celok}</td><td colspan="2">${he(c.access === "full" ? (e.uzivatel ?? "—") : "(skryté)")}</td><td>${he(e.ico ?? "")}</td><td>${he(e.parcels.join(", "))}</td></tr>`;
      }
    }
    if (c.access === "full") {
      t += `<tr><th colspan="8">Vlastníci — kat. územie ${he(d?.ku_name ?? "")}, LV ${lvNo}, celková výmera C ${c.totalAreaC} m²</th></tr><tr><th>P.č.</th><th>Vlastník</th><th>Titul</th><th>Dátum nar.</th><th>Adresa</th><th>IČO</th><th>Podiel</th><th>Výmera podľa podielu (m²)</th></tr>`;
      c.owners.forEach((o, i) => { const f = shareFrac(o.share); t += `<tr><td>${i + 1}</td><td>${he(o.name)}${o.born_name && !o.name.startsWith(o.born_name) ? he(` (rod. ${o.born_name})`) : ""}</td><td>${he(o.title ?? "")}</td><td>${he(o.birth_date ?? "")}</td><td>${he(ownerAddr(o))}</td><td>${he(o.ico ?? "")}</td><td>${he(o.share ?? "")}</td><td>${f != null ? Math.round(c.totalAreaC * f) : ""}</td></tr>`; });
    } else {
      t += `<tr><td colspan="5">Vlastníci: ${c.count} (mená skryté — rola nemá plný prístup)</td></tr>`;
    }
    t += `</table>`;
    const html = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body>${t}</body></html>`;
    download("﻿" + html, "application/vnd.ms-excel;charset=utf-8", `${isEl ? "evidencny_list" : "vypis_lv"}_${lvNo}.xls`);
  }

  // Word (HTML .doc, dep-free — Word ho otvorí, štruktúra oficiálneho dokumentu v TRI LIPY bránde)
  function exportDoc() {
    const { parcelsA, buildings } = docModel();
    const row = (cells: string[], tag = "td") => `<tr>${cells.map((x) => `<${tag}>${x}</${tag}>`).join("")}</tr>`;
    let body = `<div style="border-bottom:2px solid #333;padding-bottom:8px;margin-bottom:12px"><div style="font-size:20px;font-weight:bold;letter-spacing:3px">TRI LIPY</div><div style="font-size:9px;color:#777;letter-spacing:2px">KATASTER CORE · PRACOVNÝ ${isEl ? "EVIDENČNÝ LIST" : "VÝPIS"}</div></div>`;
    body += `<h2 style="font-family:Georgia,serif;text-transform:uppercase">${isEl ? `Register E k LV č. ${lvNo}` : `List vlastníctva č. ${lvNo}`}</h2>`;
    body += `<p style="color:#555">Katastrálne územie: <b>${he(d?.ku_name ?? "")}</b> (kód ${he(d?.ku_code ?? "")}) · ${he(d?.region ?? "")} · register ${isEl ? "E-KN" : he(d?.kn_type ?? "")}</p>`;
    body += `<p style="font-size:11px;color:#666;border:1px solid #ccc;padding:6px">Interný pracovný podklad — nie je to úradný výpis z katastra. Owner-sensitive údaje sú rolovo maskované (prístup: ${he(c.access)}).</p>`;
    body += `<h3 style="font-family:Georgia,serif">${isEl ? "Pozemky registra E" : "Časť A — Majetková podstata"}</h3>`;
    body += `<table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse;width:100%;font-size:12px">`;
    body += row(["Register", "Parcelné číslo", "Výmera (m²)", "Druh pozemku", "Umiestnenie"], "th");
    for (const p of parcelsA) body += row([p.register === "E" ? "E-KN" : "C-KN", he(p.parcel_no), String(p.area_m2), he(p.drp_text ?? "—"), he(p.placement ?? "—")]);
    body += `</table>`;
    if (!isEl && c.parcelsE.length) {
      body += `<p style="font-size:11px;color:#666;margin-top:6px"><b>Parcely registra „E" (pozemkovoknižný stav):</b></p><table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse;width:100%;font-size:12px">`;
      body += row(["Parcelné číslo", "Výmera (m²)", "Druh pozemku", "Umiestnenie"], "th");
      for (const p of c.parcelsE) body += row([he(p.parcel_no), String(p.area_m2), he(p.drp_text ?? "—"), he(p.placement ?? "—")]);
      body += `</table>`;
    }
    if (buildings.length) {
      body += `<p style="font-size:11px;color:#666;margin-top:6px"><b>Stavby:</b></p><table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse;width:100%;font-size:12px">`;
      body += row(["Popis stavby", "Na parcele"], "th");
      for (const b of buildings) body += row([he(b.descr), he(b.on_parcel ?? "—")]);
      body += `</table>`;
    }
    if (!isEl) {
      const odn = c.parcelsC.filter((p) => p.sadzba != null);
      if (odn.length) {
        body += `<p style="font-size:11px;color:#666;margin-top:6px"><b>Odňatie poľnohospodárskej pôdy (informatívne, NV 58/2013):</b></p><table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse;width:100%;font-size:12px">`;
        body += row(["Parcela", "BPEJ skupina", "Sadzba €/m²", "Trvalé €", "Dočasné €/rok"], "th");
        for (const p of odn) body += row([he(p.parcel_no), String(p.skupina ?? "—"), String(p.sadzba ?? "—"), (p.odnatie_trvale ?? 0).toFixed(2), (p.odnatie_docasne ?? 0).toFixed(2)]);
        body += row(["Spolu", "", "", c.odnatie.trvale.toFixed(2), c.odnatie.docasne.toFixed(2)]);
        body += `</table>`;
      }
      if (c.evidencne.length) {
        body += `<h3 style="font-family:Georgia,serif">Evidenčný list / užívateľ</h3><table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse;width:100%;font-size:12px">`;
        body += row(["Celok (EL)", "Užívateľ", "IČO", "Parcely C-KN"], "th");
        for (const e of c.evidencne) body += row([String(e.celok), he(c.access === "full" ? (e.uzivatel ?? "—") : "(skryté)"), he(e.ico ?? "—"), he(e.parcels.join(", "))]);
        body += `</table>`;
      }
    }
    body += `<h3 style="font-family:Georgia,serif">${isEl ? "Vlastníci / oprávnení" : "Časť B — Vlastníci"}</h3>`;
    if (c.access === "full") {
      body += `<table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse;width:100%;font-size:12px">` + row(["P.č.", "Vlastník", "Adresa", "Kat. územie", "LV", "Podiel", "Výmera podľa podielu (m²)"], "th");
      c.owners.forEach((o, i) => { const f = shareFrac(o.share); body += row([String(i + 1), he(ownerLabel(o)), he(ownerAddr(o)), he(d?.ku_name ?? "—"), String(lvNo), he(o.share ?? "—"), f != null ? String(Math.round(c.totalAreaC * f)) : "—"]); });
      body += `</table><p style="font-size:11px;color:#666">Celková výmera parciel registra C na LV: <b>${c.totalAreaC}</b> m².</p>`;
      if (!isEl && c.tarchy.length) {
        body += `<h3 style="font-family:Georgia,serif">Časť C — Ťarchy</h3><ol style="font-size:12px">` + c.tarchy.map((x) => `<li>${he(x)}</li>`).join("") + `</ol>`;
      }
    } else {
      body += `<p style="font-size:12px;color:#666">${c.count} vlastník(ov) — mená a podiely rola nevidí (prístup: ${he(c.access)}).</p>`;
    }
    body += `<p style="font-size:10px;color:#888;margin-top:16px;border-top:1px solid #ccc;padding-top:6px">Vygenerované systémom TRI LIPY KATASTER CORE · interný pracovný výstup · Tento dokument neslúži na právne úkony.</p>`;
    const html = `<html xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;color:#333}</style></head><body>${body}</body></html>`;
    download("﻿" + html, "application/msword;charset=utf-8", `${isEl ? "evidencny_list" : "vypis_lv"}_${lvNo}.doc`);
  }

  return (
    <div className="mx-auto max-w-[820px]">
      {/* Ovládanie (netlačí sa) */}
      <div className="no-print mb-4 space-y-3">
        <div className="flex items-center justify-between">
          <Link to="/browser" className="text-xs text-muted hover:text-fg">← Kataster Browser</Link>
          <div className="flex items-center gap-1.5">
            <button onClick={exportDoc} className="rounded-md border border-line px-2.5 py-2 text-sm font-medium text-fg hover:border-ink">Word</button>
            <button onClick={exportXls} className="rounded-md border border-line px-2.5 py-2 text-sm font-medium text-fg hover:border-ink">Excel</button>
            <button onClick={exportCsv} className="rounded-md border border-line px-2.5 py-2 text-sm font-medium text-fg hover:border-ink">CSV</button>
            <button
              onClick={() => { if (typeof window !== "undefined") window.print(); }}
              className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-cream"
            >
              PDF (tlač)
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface/60 p-2.5">
          <span className="text-[11px] uppercase tracking-wide text-muted">Typ dokumentu</span>
          <Chip active={!isEl} onClick={() => setDocType("vypis")}>Výpis z LV</Chip>
          <Chip active={isEl} onClick={() => setDocType("el")}>Register E (E-KN)</Chip>

          {!isEl ? (
            <>
              <span className="ml-3 text-[11px] uppercase tracking-wide text-muted">Časti</span>
              <Chip active={parts.A} onClick={() => togglePart("A")}>A — parcely</Chip>
              <Chip active={parts.B} onClick={() => togglePart("B")}>B — vlastníci</Chip>
              <Chip active={parts.C} onClick={() => togglePart("C")}>C — ťarchy</Chip>
              <button
                onClick={() => setParts({ A: true, B: true, C: true })}
                className="ml-auto text-[11px] text-muted underline-offset-2 hover:text-fg hover:underline"
              >
                Úplný výpis
              </button>
            </>
          ) : null}
        </div>
      </div>

      {/* Dokument */}
      <div className="print-doc rounded-xl border border-line bg-paper p-8">
        {/* Hlavička */}
        <div className="flex items-start justify-between border-b-2 pb-4" style={{ borderColor: "#333333" }}>
          <div className="flex items-center gap-3">
            <img src="/tl-tree.png" alt="" className="h-11 w-auto" aria-hidden />
            <div className="leading-tight">
              <div className="font-display text-lg font-bold uppercase tracking-[0.18em] text-fg">TRI LIPY</div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-muted">Kataster Core · pracovný {isEl ? "výpis registra E" : "výpis"}</div>
            </div>
          </div>
          <div className="text-right text-xs text-muted">
            <div>Stav dát: {d?.updated_at ?? "—"}</div>
            <div>Import: {d?.import_version ?? "—"}</div>
          </div>
        </div>

        <h1 className="mt-5 font-display text-2xl font-bold uppercase tracking-wide text-fg">
          {isEl ? `Register E k LV č. ${lvNo}` : `List vlastníctva č. ${lvNo}`}
          {partial ? <span className="ml-2 align-middle text-sm font-normal normal-case tracking-normal text-muted">(čiastočný výpis — časti {["A", "B", "C"].filter((k) => parts[k as "A" | "B" | "C"]).join(", ")})</span> : null}
        </h1>
        <div className="mt-1 text-sm text-muted">
          Katastrálne územie: <span className="text-fg">{d?.ku_name ?? "—"}</span> (kód {d?.ku_code ?? "—"}) · {d?.region ?? "—"} · register {isEl ? "E-KN / pozemkovoknižný stav" : d?.kn_type ?? "—"}
        </div>

        <div className="mt-3 rounded-md border px-3 py-2 text-[11px] leading-relaxed" style={{ borderColor: "#9a7b3e55", background: "#33333312", color: "#5b5b5b" }}>
          <b>Interný pracovný podklad</b> — nie je to úradný výpis z katastra nehnuteľností ani právne potvrdenie vlastníctva.
          Owner-sensitive údaje (mená, dátumy narodenia, tituly, ťarchy) sú rolovo maskované — server ich vydá len role s plným prístupom (rola: {role}, prístup: {c.access}).
          Odvodené z lokálneho SPI/VGI importu.
        </div>

        {isEl ? (
          /* ——— EVIDENČNÝ LIST (register E) ——— */
          <>
            <Section title="Pozemky pozemkovoknižného stavu (register E-KN)">
              {c.parcelsE.length ? (
                <Table
                  head={["Register", "Parcelné číslo", "Výmera", "Druh pozemku", "Umiestnenie"]}
                  rows={c.parcelsE.map((p) => ["E-KN", p.parcel_no, m2(p.area_m2), p.drp_text ?? "—", p.placement ?? "—"])}
                  mono={[1]}
                />
              ) : (
                <div className="px-1 py-2 text-sm text-muted">
                  Na tomto LV nie sú evidované parcely registra E (pozemkovoknižné). Register E sa vzťahuje na pôvodný pozemkovoknižný stav — pri C-KN LV môže byť prázdny. Skutočný <b>evidenčný list</b> (historický užívateľ) nájdeš cez mapu → identify → „Evidenčný list".
                </div>
              )}
            </Section>
            <OwnersSection c={c} role={role} label="Vlastníci / oprávnené osoby podľa evidenčného stavu" />
          </>
        ) : (
          /* ——— VÝPIS Z LV (Časti A/B/C) ——— */
          <>
            {(c.signals || c.settledSummary.total > 0) ? (
              <Section title="Analytické signály & skóre (interné — nie súčasť úradného výpisu)">
                {c.signals ? (
                  <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
                    <span className="text-muted">Skóre príležitosti:</span>
                    <b className="text-2xl tabular-nums text-fg">{c.signals.score}</b>
                    {c.signals.reasons.length ? <span className="text-muted">{c.signals.reasons.join(" · ")}</span> : null}
                  </div>
                ) : <div className="text-sm text-muted">Pre toto LV zatiaľ nemáme vypočítané signály.</div>}
                {c.settledSummary.total > 0 ? (
                  <div className="mt-1 text-[12px] text-muted">
                    Vysporiadanosť C-KN parciel na LV: <b className="text-fg">{c.settledSummary.settled}</b> vysporiadaných,{" "}
                    <b className="text-fg">{c.settledSummary.unsettled}</b> nevysporiadaných z {c.settledSummary.total}.
                  </div>
                ) : null}
                <div className="mt-1 text-[11px] text-muted">Skóre = vážený indikátor príležitosti (spoluvlastníci, SPF/štát, dedičské, stavebný potenciál, absentéri, čistý titul). Pracovný nástroj, nie právny záver.</div>
              </Section>
            ) : null}
            {parts.A ? (
              <Section title="Časť A — Majetková podstata">
                {/* Parcely registra „C" — katastrálna mapa */}
                <div className="mb-1 text-[11px] uppercase tracking-wide text-muted">Parcely registra „C" evidované na katastrálnej mape</div>
                {c.parcelsC.length ? (
                  <Table
                    head={["Parcelné číslo", "Výmera (m²)", "Druh pozemku", "Umiestnenie", "Vysporiadané", "BPEJ", "Odňatie – trvalé"]}
                    rows={c.parcelsC.map((p) => [
                      p.parcel_no,
                      m2(p.area_m2),
                      p.drp_text ?? "—",
                      p.placement ?? "—",
                      p.settled === 1 ? "áno" : p.settled === 0 ? "nie" : "—",
                      p.bpej ? `${p.bpej}${p.skupina != null ? ` (${p.skupina}/9)` : ""}` : (p.skupina != null ? `${p.skupina}/9` : "—"),
                      p.odnatie_trvale != null ? `${eur(p.odnatie_trvale)} €` : "—",
                    ])}
                    mono={[0]}
                  />
                ) : (
                  <div className="px-1 py-2 text-sm text-muted">Na tomto LV nie sú evidované parcely registra C.</div>
                )}

                {/* Parcely registra „E" — pozemkovoknižný stav (patria do majetkovej podstaty) */}
                {c.parcelsE.length ? (
                  <div className="mt-3">
                    <div className="mb-1 text-[11px] uppercase tracking-wide text-muted">Parcely registra „E" evidované na mape určeného operátu</div>
                    <Table
                      head={["Parcelné číslo", "Výmera (m²)", "Druh pozemku", "Umiestnenie"]}
                      rows={c.parcelsE.map((p) => [p.parcel_no, m2(p.area_m2), p.drp_text ?? "—", p.placement ?? "—"])}
                      mono={[0]}
                    />
                  </div>
                ) : null}

                {c.odnatie && c.odnatie.count > 0 ? (
                  <div className="mt-2 text-[12px] text-muted">
                    Odňatie poľnohospodárskej pôdy spolu (C-KN, informatívne)<LegalRef id="odvody" />: trvalé{" "}
                    <b className="text-fg">{eur(c.odnatie.trvale)} €</b>, dočasné{" "}
                    <b className="text-fg">{eur(c.odnatie.docasne)} €</b> / rok. Sadzby NV 58/2013 podľa skupiny BPEJ.
                  </div>
                ) : null}
                {c.buildings.length ? (
                  <div className="mt-3">
                    <div className="mb-1 text-[11px] uppercase tracking-wide text-muted">Stavby</div>
                    <Table head={["Popis stavby", "Na parcele"]} rows={c.buildings.map((b) => [b.descr, b.on_parcel || "—"])} mono={[1]} />
                  </div>
                ) : null}
                {/* Celková výmera + orientačný odhad hodnoty */}
                <div className="mt-3 border-t border-line pt-2 text-[12px]">
                  <span className="text-muted">Celková výmera parciel na LV: </span>
                  <b className="text-fg">{m2(c.totalAreaC)}</b>
                  {c.totalAreaE > 0 ? <span className="text-muted"> · register E: <b className="text-fg">{m2(c.totalAreaE)}</b></span> : null}
                  {(() => {
                    const mv = c.parcelsC.reduce((a, p) => a + marketValueEur(p.drp_text, p.placement, p.area_m2).total, 0);
                    return mv > 0 ? (
                      <div className="mt-1 text-muted">
                        Orientačný odhad hodnoty (trhový, hrubý screening — nie znalecký posudok): <b className="text-fg">~ {eur(mv)} €</b>
                        {c.odnatie && c.odnatie.count > 0 ? <span> · odňatie pôdy {eur(c.odnatie.trvale)} €</span> : null}
                      </div>
                    ) : null;
                  })()}
                </div>
              </Section>
            ) : null}

            {parts.A && c.evidencne && c.evidencne.length ? (
              <Section title="Evidenčný list / užívateľ (k C-KN parcelám)">
                <Table
                  head={["Celok (EL)", "Užívateľ", "IČO", "Parcely C-KN"]}
                  rows={c.evidencne.map((e) => [
                    String(e.celok),
                    c.access === "full" ? (e.uzivatel ?? "—") : "—",
                    e.ico ?? "—",
                    e.parcels.join(", ") || "—",
                  ])}
                  mono={[0, 3]}
                />
                {c.access !== "full" ? (
                  <div className="mt-2 rounded-md border border-line bg-surface-2/40 px-3 py-2 text-sm text-muted">
                    Meno historického užívateľa je owner-sensitive — rola <b className="text-fg">{role}</b> ho nevidí.
                  </div>
                ) : (
                  <div className="mt-2 text-[12px] text-muted">
                    Evidenčný list zobrazuje <b className="text-fg">historického užívateľa</b> (nie vlastníka)<LegalRef id="evidencny_list" />.
                  </div>
                )}
              </Section>
            ) : null}

            {parts.B ? (
              <Section title="Časť B — Vlastníci a iné oprávnené osoby">
                <OwnersSection c={c} role={role} label={null} />
                {/* Nadobúdacie tituly */}
                <div className="mt-3">
                  <div className="mb-1 text-[11px] uppercase tracking-wide text-muted">Tituly nadobudnutia</div>
                  {c.access === "full" ? (
                    c.titles.length ? (
                      <ol className="list-decimal space-y-1 pl-5 text-[13px] text-fg">
                        {c.titles.map((t, i) => <li key={i}>{t}</li>)}
                      </ol>
                    ) : (
                      <div className="px-1 py-1 text-sm text-muted">Bez evidovaného titulu.</div>
                    )
                  ) : (
                    <div className="rounded-md border border-line bg-surface-2/40 px-3 py-2 text-sm text-muted">
                      {c.titlesCount} titul(ov) — text rola <b className="text-fg">{role}</b> nevidí.
                    </div>
                  )}
                </div>
              </Section>
            ) : null}

            {parts.C ? (
              <Section title="Časť C — Ťarchy">
                {c.access === "full" ? (
                  c.tarchy.length ? (
                    <ol className="list-decimal space-y-1 pl-5 text-[13px] text-fg">
                      {c.tarchy.map((t, i) => <li key={i}>{t}</li>)}
                    </ol>
                  ) : (
                    <div className="px-1 py-2 text-sm text-muted">Bez evidovaného zápisu ťarchy v pracovných dátach.</div>
                  )
                ) : (
                  <div className="rounded-md border border-line bg-surface-2/40 px-3 py-2 text-sm text-muted">
                    {c.tarchyCount} zápis(ov) ťarchy — text rola <b className="text-fg">{role}</b> nevidí (owner-sensitive).
                  </div>
                )}
              </Section>
            ) : null}
          </>
        )}

        {/* Pätička */}
        <div className="mt-6 border-t border-line pt-3 text-[11px] text-muted">
          Vygenerované systémom <b className="text-fg">TRI LIPY KATASTER CORE</b> · interný pracovný výstup · Export Safety: owner masking = {c.access}.
          {partial ? " Čiastočný výpis — vybrané časti." : ""} Tento dokument neslúži na právne úkony.
        </div>
      </div>
    </div>
  );
}

function ownerLabel(o: Content["owners"][number]): string {
  if (o.is_company) return `${o.name}${o.ico ? ` (IČO ${o.ico})` : " (právnická osoba)"}`;
  const t = o.title ? `${o.title} ` : "";
  const rod = o.born_name && !o.name.startsWith(o.born_name) ? ` (rod. ${o.born_name})` : "";
  const nar = o.birth_date ? `, nar. ${o.birth_date}` : "";
  return `${t}${o.name}${rod}${nar}`;
}
function ownerAddr(o: Content["owners"][number]): string {
  const parts: string[] = [];
  if (o.addr_obec && o.addr_obec !== "č.") parts.push(o.addr_obec);
  if (o.addr_cislo) parts.push(`č. ${o.addr_cislo}`);
  if (o.addr_psc) parts.push(o.addr_psc);
  return parts.join(", ") || "—";
}

// Podiel „a/b" → zlomok; prislúchajúca výmera = celková výmera C × podiel.
function shareFrac(share: string | null | undefined): number | null {
  if (!share) return null;
  const m = String(share).match(/(\d+)\s*\/\s*(\d+)/);
  if (m) { const b = Number(m[2]); return b ? Number(m[1]) / b : null; }
  const n = Number(String(share).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function CompanyRegistry({ ico, name, role }: { ico: string; name: string; role: string }) {
  const [rpo, setRpo] = useState<Awaited<ReturnType<typeof lookupRpo>> | null>(null);
  const [rpvs, setRpvs] = useState<Awaited<ReturnType<typeof lookupRpvs>> | null>(null);
  const [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true);
    try {
      const [a, b] = await Promise.all([
        lookupRpo({ data: { q: ico, role: role as Role } }).catch(() => null),
        lookupRpvs({ data: { ico, role: role as Role } }).catch(() => null),
      ]);
      setRpo(a); setRpvs(b);
    } finally { setBusy(false); }
  }
  const r0 = rpo?.ok ? rpo.results[0] : undefined;
  return (
    <div className="rounded-md border border-line bg-surface-2/30 p-2 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-fg">{name} <span className="text-muted">· IČO {ico}</span></span>
        {!rpo && !rpvs ? <button onClick={load} disabled={busy} className="shrink-0 rounded-md border border-line px-2 py-0.5 text-fg hover:border-ink">{busy ? "…" : "Načítať register"}</button> : null}
      </div>
      {r0 ? (
        <div className="mt-1 space-y-0.5">
          {r0.address ? <div className="text-muted">{r0.address}</div> : null}
          <div className="text-muted">{[r0.legal_form, r0.established ? `vznik ${r0.established}` : null, r0.terminated ? `zánik ${r0.terminated}` : null].filter(Boolean).join(" · ") || "—"}</div>
          {r0.statutory.length ? (
            <div className="mt-1"><span className="text-[10px] uppercase tracking-wide text-muted">Štatutári (koho osloviť)</span>
              {r0.statutory.map((s, i) => <div key={i} className="text-fg">{s.name} <span className="text-muted">· {s.role}</span></div>)}
            </div>
          ) : null}
        </div>
      ) : rpo && !rpo.ok ? <div className="mt-1 text-muted">RPO: {rpo.message ?? "bez výsledku"}.</div> : null}
      {rpvs?.found && rpvs.kuv.length ? (
        <div className="mt-1"><span className="text-[10px] uppercase tracking-wide text-muted">Koneční užívatelia výhod (RPVS)</span>
          {rpvs.kuv.map((k, i) => <div key={i} className="text-fg">{k.name}{k.pep ? " · PEP" : ""}{!k.current ? " (historický)" : ""}</div>)}
        </div>
      ) : rpvs && !rpvs.found ? <div className="mt-1 text-muted">RPVS: {rpvs.message ?? "nie je partner verejného sektora"}.</div> : null}
    </div>
  );
}
function OwnersSection({ c, role, label }: { c: Content; role: string; label: string | null }) {
  const ku = c.dataset?.ku_name ?? "—";
  const shareM2 = (share: string | null | undefined): string => {
    const f = shareFrac(share);
    return f != null ? m2(Math.round(c.totalAreaC * f)) : "—";
  };
  return (
    <div>
      {label ? <div className="mb-1 font-display text-sm font-bold uppercase tracking-wide text-fg">{label}</div> : null}
      {c.access === "full" ? (
        c.owners.length ? (
          <>
            <Table
              head={["P. č.", "Vlastník", "Adresa", "Kat. územie", "LV", "Podiel", "Výmera podľa podielu (m²)"]}
              rows={c.owners.map((o, i) => [String(i + 1), ownerLabel(o), ownerAddr(o), ku, String(c.lvNo), o.share || "—", shareM2(o.share)])}
              mono={[0, 4, 5, 6]}
            />
            <div className="mt-2 text-[12px] text-muted">
              Celková výmera parciel registra C na LV: <b className="text-fg">{m2(c.totalAreaC)}</b>. „Výmera podľa podielu" = celková výmera × spoluvlastnícky podiel.
            </div>
            {(() => {
              const firmy = c.owners.filter((o) => o.is_company && o.ico);
              return firmy.length ? (
                <div className="mt-3 space-y-1.5">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Firemní vlastníci — RPVS/RPO (štatutári + koneční užívatelia výhod)</div>
                  {firmy.map((o, i) => <CompanyRegistry key={i} ico={o.ico as string} name={o.name} role={role} />)}
                </div>
              ) : null;
            })()}
          </>
        ) : (
          <div className="px-1 py-2 text-sm text-muted">Bez zápisu vlastníkov.</div>
        )
      ) : (
        <div className="rounded-md border border-line bg-surface-2/40 px-3 py-2 text-sm text-muted">
          {c.count} vlastník(ov). Mená a podiely rola <b className="text-fg">{role}</b> nevidí
          ({c.access === "summary" ? "summary-only" : "denied"}) — server ich do výpisu nevkladá.
        </div>
      )}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors " +
        (active ? "border-ink bg-ink text-cream" : "border-line bg-paper text-muted hover:text-fg")
      }
    >
      {children}
    </button>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-5">
      <div className="mb-1 border-b border-line pb-1 font-display text-sm font-bold uppercase tracking-wide text-fg">{title}</div>
      {children}
    </div>
  );
}

function Table({ head, rows, mono = [] }: { head: string[]; rows: string[][]; mono?: number[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-muted">
            {head.map((h, i) => <th key={i} className="px-2 py-1.5 font-medium">{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r, ri) => (
            <tr key={ri}>
              {r.map((cell, ci) => (
                <td key={ci} className={"px-2 py-1.5 " + (mono.includes(ci) ? "font-mono tabular-nums text-fg" : "text-fg")}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
