import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { getLvVypis, lookupRpo, lookupRpvs, getLvIntel, getLvSettlement, getParcelLimits, getUpRegulativ, getParcelAccessibility, getChanges } from "../lib/api/kataster.functions";
import { m2, marketValueEur } from "../lib/domain";
import { useRole } from "../lib/role-context";
import type { Role } from "../lib/domain";
import { CommentsPanel, WatchButton } from "../components/collab";
import { LegalRef } from "../components/legal-ref";
import { regulativByCode, regulativFromZone, proxyZone, developmentCalc, DEV_DEFAULTS, type Regulativ, type DevCalc } from "../lib/development";

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

  // Analytická + vysporiadacia nadstavba do Word exportu (fetch na požiadanie, rovnaká logika ako sekcie na obrazovke).
  async function analyticsDocHtml(): Promise<string> {
    try {
      const intel = await getLvIntel({ data: { datasetId, lvNo } });
      let html = `<h3 style="font-family:Georgia,serif">Analytická nadstavba (orientačné, interné — nie znalecký ani úradný výstup)</h3>`;
      const a = intel.avm;
      if (a.total_estimate_eur != null) {
        html += `<p style="font-size:12px">Odhad trhovej hodnoty LV (AVM): <b>~ ${eur(a.total_estimate_eur)} €</b> (rozpätie ${eur(a.total_low_eur ?? 0)}–${eur(a.total_high_eur ?? 0)} €, istota ${he(String(a.confidence))}, ${a.valued}/${a.total_parcels} parciel ocenených).${a.factors.length ? " " + he(a.factors.join("; ")) : ""}</p>`;
      }
      const repr = intel.repr;
      if (repr) {
        const [lim, reg] = await Promise.all([
          getParcelLimits({ data: { lat: repr.lat, lng: repr.lng } }).catch(() => null),
          getUpRegulativ({ data: { datasetId } }).catch(() => [] as Awaited<ReturnType<typeof getUpRegulativ>>),
        ]);
        const hits = lim?.items.filter((i) => i.hit) ?? [];
        html += `<p style="font-size:12px">Limity využitia (parcela ${he(repr.parcel_no)}): ${hits.length ? he(hits.map((h) => `${h.label}${h.count ? ` (${h.count})` : ""}`).join(", ")) : "žiadne evidované (zosuvy/záplavy/les/pásma)"}.</p>`;
        const def = reg.find((r) => r.zone_code === "*" && r.ipp != null) ?? reg.find((r) => r.ipp != null);
        const regUsed = def ? regulativFromZone({ code: def.zone_code, name: def.funkcia, ipp: def.ipp, izp: def.izp, kz: def.kz }) : (regulativByCode(proxyZone(repr.use_type, null)) ?? null);
        if (regUsed && repr.area_m2 > 0) {
          const low = regUsed.ipp <= 0.7 || /bývanie|rodinn|ibv/i.test(`${regUsed.kategoria} ${regUsed.name}`);
          const opts = low ? { m2PerByt: 110, nakladyEurM2Hpp: 1500, predajEurM2: 1900 } : DEV_DEFAULTS;
          const dev = developmentCalc(repr.area_m2, regUsed, opts);
          html += `<p style="font-size:12px">Územný plán &amp; zastavateľnosť: <b>${he(regUsed.name)}</b> (IZP ${regUsed.izp}, IPP ${regUsed.ipp}, KZ ${regUsed.kz}).`;
          if (dev.buildable) html += ` Zastavateľná ${m2(dev.izpArea)}, HPP ${m2(dev.hpp)}, ~ ${low ? Math.max(1, Math.round(dev.izpArea / 120)) + " RD jednotiek" : dev.byty + " bytov"}, GDV ${eur(dev.ekonomika.gdv)} €, náklady ${eur(dev.ekonomika.naklady)} €, marža ${dev.ekonomika.marzaPct} %.`;
          html += `</p>`;
        }
      }
      const st = await getLvSettlement({ data: { datasetId, lvNo, role } }).catch(() => null);
      if (st && (st.issues.length || (st.access === "full" && st.owners.length))) {
        html += `<h3 style="font-family:Georgia,serif">Vysporiadanie &amp; odkup podielov (orientačné)</h3>`;
        html += `<p style="font-size:12px">Náročnosť vysporiadania: <b>${he(DIFF_LABEL[st.difficulty])}</b> · potenciál ${st.potential_score}/100.</p>`;
        if (st.issues.length) {
          html += `<ul style="font-size:12px">` + st.issues.map((it) => {
            const g = st.guides[it.type];
            let li = `<li><b>${he(g?.nazov ?? it.type)}</b> — ${he(it.note)}`;
            if (g) li += `<br><i>§ ${he(g.zakony.join("; "))}</i><br>Postup: ${he(g.postup.join(" "))}<br>⚠ ${he(g.upozornenie)}`;
            return li + `</li>`;
          }).join("") + `</ul>`;
        }
        if (st.access === "full" && st.owners.length) {
          html += `<p style="font-size:12px">Odkup podielov (AVM hodnota LV ${st.avm_eur != null ? `~ ${eur(st.avm_eur)} €` : "—"}): 50 % ${st.scenarios.majority != null ? eur(st.scenarios.majority) + " €" : "—"}, 2/3 ${st.scenarios.qualified != null ? eur(st.scenarios.qualified) + " €" : "—"}, 100 % súkromné ${st.scenarios.full != null ? eur(st.scenarios.full) + " €" : "—"}; súkromný podiel ${(st.private_share * 100).toFixed(2)} %${st.spf_share > 0 ? `, SPF/štát ${(st.spf_share * 100).toFixed(2)} % (zvlášť)` : ""}.</p>`;
          html += `<table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse;width:100%;font-size:12px"><tr><th>Vlastník</th><th>Podiel</th><th>Odhad odkupu</th></tr>`;
          html += st.owners.map((o) => `<tr><td>${he(o.name)}${o.is_state ? " (SPF/štát)" : o.is_company ? " (firma)" : ""}</td><td>${he(o.share_str ?? "—")}</td><td>${o.is_state ? "— (cez SPF)" : o.est_eur != null ? eur(o.est_eur) + " €" : "—"}</td></tr>`).join("");
          html += `</table>`;
        }
        html += `<p style="font-size:10px;color:#666">${he(st.disclaimer)}</p>`;
      }
      return html;
    } catch { return ""; }
  }

  // Word (HTML .doc, dep-free — Word ho otvorí, štruktúra oficiálneho dokumentu v TRI LIPY bránde)
  async function exportDoc() {
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
    if (!isEl) body += await analyticsDocHtml();
    body += `<p style="font-size:10px;color:#888;margin-top:16px;border-top:1px solid #ccc;padding-top:6px">Vygenerované systémom TRI LIPY KATASTER CORE · interný pracovný výstup · Tento dokument neslúži na právne úkony.</p>`;
    const html = `<html xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;color:#333}</style></head><body>${body}</body></html>`;
    download("﻿" + html, "application/msword;charset=utf-8", `${isEl ? "evidencny_list" : "vypis_lv"}_${lvNo}.doc`);
  }

  // Oslovovacie listy vlastníkom (.doc) — 1 list pre každého súkromného spoluvlastníka + súhrn (branded).
  // NEODOSIELA — len vygeneruje dokument; odoslanie robí používateľ. Owner-sensitive (len full).
  async function exportOutreach() {
    if (c.access !== "full") return;
    const st = await getLvSettlement({ data: { datasetId, lvNo, role } }).catch(() => null);
    const avm = st?.avm_eur ?? null;
    const settlement = (st?.issues.length ?? 0) > 0;
    const ku = d?.ku_name ?? "";
    const brand = `<div style="border-bottom:2px solid #1E3A2F;padding-bottom:8px;margin-bottom:14px"><div style="font-size:20px;font-weight:bold;letter-spacing:3px;color:#1E3A2F">TRI LIPY</div><div style="font-size:9px;color:#5C8A6B;letter-spacing:2px">PRACOVNÝ PODKLAD — NÁVRH LISTU</div></div>`;
    const suppressedNames = new Set((st?.owners ?? []).filter((o) => o.suppressed).map((o) => o.name));
    const priv = c.owners.filter((o) => !o.is_company && !suppressedNames.has(o.name));
    if (!priv.length) { window.alert(suppressedNames.size ? "Súkromní spoluvlastníci sú v GDPR suppression (neoslovovať) alebo tu nie sú." : "Na tomto LV nie sú súkromní (fyzickí) spoluvlastníci pre oslovenie."); return; }
    const offerFor = (o: Content["owners"][number]): number | null => {
      const f = shareFrac(o.share); if (avm == null || f == null) return null;
      return Math.round(avm * f * (f < 0.05 ? 0.7 : 1));
    };
    const letters = priv.map((o) => {
      const f = shareFrac(o.share);
      const shM2 = f != null ? `${Math.round(c.totalAreaC * f)} m²` : "—";
      const offer = offerFor(o);
      const parcelaTxt = `nehnuteľností evidovaných na liste vlastníctva č. ${lvNo} v katastrálnom území ${he(ku)} (Váš spoluvlastnícky podiel ${he(o.share ?? "—")}${f != null ? `, čo zodpovedá približne ${shM2}` : ""})`;
      const bodyTxt = settlement
        ? `obraciam sa na Vás vo veci ${parcelaTxt}. Nehnuteľnosť je v podielovom/nevysporiadanom spoluvlastníctve. Ponúkam odkúpenie Vášho podielu za férovú cenu vychádzajúcu z trhových údajov v lokalite${offer != null ? ` (orientačne ${eur(offer)} € za Váš podiel)` : ""}. Vysporiadanie a náklady na prevod zabezpečím a hradím ja. Rešpektujem predkupné právo spoluvlastníkov.`
        : `obraciam sa na Vás s konkrétnou ponukou na odkúpenie ${parcelaTxt}.${offer != null ? ` Ponúkam ${eur(offer)} € za Váš podiel; cena vychádza z aktuálnych trhových údajov v lokalite.` : ""} Náklady na prevod a poplatky hradím ja. V prípade záujmu ma prosím kontaktujte.`;
      return `<div style="page-break-after:always;font-family:Georgia,serif;font-size:13px;line-height:1.5;max-width:640px">${brand}`
        + `<div style="margin-bottom:18px"><b>${he(ownerLabel(o))}</b><br>${he(ownerAddr(o))}</div>`
        + `<div style="margin-bottom:12px">Vážený vlastník, vážená vlastníčka,</div>`
        + `<div style="margin-bottom:12px">${he(bodyTxt)}</div>`
        + `<div style="margin-bottom:2px">S úctou,</div><div style="color:#555">[meno odosielateľa]<br>[telefón / e-mail]<br>[dátum]</div>`
        + `<div style="margin-top:22px;font-size:9px;color:#888;border-top:1px solid #ccc;padding-top:6px">Spracúvanie osobných údajov: účel — ponuka na odkúpenie / vysporiadanie nehnuteľnosti (oprávnený záujem prevádzkovateľa). Máte právo namietať a žiadať výmaz na kontakte [e-mail]. Údaje pochádzajú z verejného katastra nehnuteľností.</div></div>`;
    }).join("");
    const totalOffer = priv.reduce((a, o) => a + (offerFor(o) ?? 0), 0);
    const summary = `<div style="font-family:Georgia,serif;font-size:12px;max-width:680px">${brand}`
      + `<h2 style="text-transform:uppercase">Súhrn oslovenia — LV č. ${lvNo}, k.ú. ${he(ku)}</h2>`
      + `<p style="color:#555">Súkromných spoluvlastníkov na oslovenie: <b>${priv.length}</b>. ${settlement ? "Typ: vysporiadanie podielov." : "Typ: priama ponuka na odkup."} Orientačná hodnota LV (AVM): ${avm != null ? `<b>${eur(avm)} €</b>` : "—"}. Súčet ponúk súkromných podielov: <b>${eur(totalOffer)} €</b>.</p>`
      + `<table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse;width:100%;font-size:12px"><tr><th>Vlastník</th><th>Podiel</th><th>Ponuka</th></tr>`
      + priv.map((o) => { const of = offerFor(o); return `<tr><td>${he(ownerLabel(o))}</td><td>${he(o.share ?? "—")}</td><td>${of != null ? eur(of) + " €" : "—"}</td></tr>`; }).join("")
      + `</table>`
      + `<p style="font-size:10px;color:#888;margin-top:10px">Interný pracovný podklad. Ponuky sú orientačné (AVM × podiel; malé podiely so zľavou). NEODOSIELA sa automaticky — doplň kontakt a odošli manuálne. Rešpektuj predkupné právo spoluvlastníkov (§ 140 OZ).</p>`
      + (c.owners.some((o) => o.is_company) ? `<p style="font-size:10px;color:#888">Pozn.: firemní/štátni spoluvlastníci (napr. SPF) nie sú v listoch — vyžadujú osobitný proces (SPF/RPVS).</p>` : "")
      + `<div style="page-break-after:always"></div></div>`;
    const html = `<html xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"></head><body>${summary}${letters}</body></html>`;
    download("﻿" + html, "application/msword;charset=utf-8", `listy_vlastnikom_LV${lvNo}.doc`);
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
            {!isEl && c.access === "full" && c.owners.some((o) => !o.is_company) ? (
              <button onClick={() => void exportOutreach()} title="Vygenerovať oslovovacie listy súkromným spoluvlastníkom (.doc) — neodosiela sa"
                className="rounded-md border border-line px-2.5 py-2 text-sm font-medium text-fg hover:border-ink">Listy vlastníkom</button>
            ) : null}
            <button
              onClick={() => { if (typeof window !== "undefined") window.print(); }}
              className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-cream"
            >
              PDF (tlač)
            </button>
          </div>
        </div>

        {/* Kolaborácia — sledovanie + tímové komentáre k tomuto LV */}
        <div className="rounded-lg border border-line bg-surface/60 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[11px] uppercase tracking-wide text-muted">Tím — LV {lvNo}{c.dataset?.ku_name ? ` · ${c.dataset.ku_name}` : ""}</span>
            <WatchButton subjectType="lv" subjectId={`${datasetId}:${lvNo}`} label={`LV ${lvNo}${c.dataset?.ku_name ? " · " + c.dataset.ku_name : ""}`} />
          </div>
          <CommentsPanel subjectType="lv" subjectId={`${datasetId}:${lvNo}`} />
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
            <LvIntelSection datasetId={datasetId} lvNo={lvNo} />
            <LvSettlementSection datasetId={datasetId} lvNo={lvNo} role={role} />
            <LvHistorySection datasetId={datasetId} lvNo={lvNo} />
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

function accItem(label: string, hit: { drive_min: number; dist: number } | null | undefined) {
  if (!hit) return <span>{label}: —</span>;
  return <span>{label}: <b className="text-fg">{hit.drive_min} min</b></span>;
}

const CONF_LABEL: Record<string, string> = { "vysoká": "vysoká istota", "stredná": "stredná istota", "nízka": "nízka istota", "—": "bez dát" };

// Analytická nadstavba LV — AVM hodnota + limity + ÚP/zastavateľnosť (GDV) + dostupnosť.
// Reuse živých server fns (getLvIntel/getParcelLimits/getUpRegulativ/getParcelAccessibility) + development.ts.
function LvIntelSection({ datasetId, lvNo }: { datasetId: string; lvNo: number }) {
  const [intel, setIntel] = useState<Awaited<ReturnType<typeof getLvIntel>> | null>(null);
  const [limits, setLimits] = useState<Awaited<ReturnType<typeof getParcelLimits>> | null>(null);
  const [reg, setReg] = useState<Awaited<ReturnType<typeof getUpRegulativ>>>([]);
  const [acc, setAcc] = useState<Awaited<ReturnType<typeof getParcelAccessibility>> | null>(null);
  const [accBusy, setAccBusy] = useState(false);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let alive = true;
    setIntel(null); setLimits(null); setReg([]); setAcc(null); setErr(false);
    getLvIntel({ data: { datasetId, lvNo } })
      .then((r) => {
        if (!alive) return;
        setIntel(r);
        if (r.repr) getParcelLimits({ data: { lat: r.repr.lat, lng: r.repr.lng } }).then((l) => { if (alive) setLimits(l); }).catch(() => {});
        getUpRegulativ({ data: { datasetId } }).then((u) => { if (alive) setReg(u); }).catch(() => {});
      })
      .catch(() => { if (alive) setErr(true); });
    return () => { alive = false; };
  }, [datasetId, lvNo]);

  if (err) return null;
  if (!intel) return (
    <Section title="Analytická nadstavba (interné)">
      <div className="px-1 py-2 text-sm text-muted">Počítam odhad hodnoty, limity a zastavateľnosť…</div>
    </Section>
  );

  const a = intel.avm;
  const repr = intel.repr;
  let dev: DevCalc | null = null; let regUsed: Regulativ | null = null; let regSource = "";
  let lowDensity = false; let devOpts = DEV_DEFAULTS;
  if (repr) {
    const def = reg.find((r) => r.zone_code === "*" && r.ipp != null) ?? reg.find((r) => r.ipp != null);
    if (def) { regUsed = regulativFromZone({ code: def.zone_code, name: def.funkcia, ipp: def.ipp, izp: def.izp, kz: def.kz }); regSource = "ÚP regulatív obce"; }
    else { regUsed = regulativByCode(proxyZone(repr.use_type, null)) ?? null; regSource = "proxy z druhu pozemku"; }
    if (regUsed && repr.area_m2 > 0) {
      // IBV / rodinné domy (nízka hustota) majú iné predpoklady než bytovky (náklady/predaj/jednotky)
      lowDensity = regUsed.ipp <= 0.7 || /bývanie|rodinn|ibv/i.test(`${regUsed.kategoria} ${regUsed.name}`);
      devOpts = lowDensity ? { m2PerByt: 110, nakladyEurM2Hpp: 1500, predajEurM2: 1900 } : DEV_DEFAULTS;
      dev = developmentCalc(repr.area_m2, regUsed, devOpts);
    }
  }
  const hits = limits?.items.filter((i) => i.hit) ?? [];
  const limitsLoaded = limits != null;

  async function loadAcc() {
    if (!repr) return;
    setAccBusy(true);
    try { setAcc(await getParcelAccessibility({ data: { lat: repr.lat, lng: repr.lng } })); }
    finally { setAccBusy(false); }
  }

  return (
    <Section title="Analytická nadstavba — orientačné (interné, nie znalecký ani úradný výstup)">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-line bg-surface/50 p-3">
          <div className="text-[11px] uppercase tracking-wide text-muted">Odhad trhovej hodnoty LV (AVM)</div>
          {a.total_estimate_eur != null ? (
            <>
              <div className="mt-1 text-2xl font-bold tabular-nums text-fg">~ {eur(a.total_estimate_eur)} €</div>
              <div className="text-[12px] text-muted">rozpätie {eur(a.total_low_eur ?? 0)}–{eur(a.total_high_eur ?? 0)} € · {CONF_LABEL[String(a.confidence)] ?? String(a.confidence)}</div>
              <div className="mt-1 text-[11px] text-muted">{a.valued}/{a.total_parcels} parciel ocenených{a.capped ? " (strop 25)" : ""}{a.ppm2_repr != null ? ` · repr. ${a.ppm2_repr} €/m² (${a.klass_repr})` : ""}</div>
              {a.factors.length ? <div className="mt-1 text-[11px] text-muted">{a.factors.join(" · ")}</div> : null}
            </>
          ) : (
            <div className="mt-1 text-sm text-muted">Bez dostatočných trhových porovnaní pre odhad.</div>
          )}
        </div>

        <div className="rounded-lg border border-line bg-surface/50 p-3">
          <div className="text-[11px] uppercase tracking-wide text-muted">Limity využitia{repr ? ` (parcela ${repr.parcel_no})` : ""}</div>
          {!limitsLoaded ? (
            <div className="mt-1 text-sm text-muted">{repr ? "Zisťujem limity…" : "Bez geometrie parcely."}</div>
          ) : hits.length ? (
            <ul className="mt-1 space-y-0.5 text-[13px] text-fg">
              {hits.map((h, i) => <li key={i}>⚠ {h.label}{h.count ? ` (${h.count})` : ""} <span className="text-[10px] text-muted">· do {h.buffer} m</span></li>)}
            </ul>
          ) : (
            <div className="mt-1 text-sm text-fg">✓ Žiadne evidované limity (zosuvy/záplavy/les/pásma) v okolí.</div>
          )}
          {limitsLoaded ? <div className="mt-1 text-[10px] text-muted">Zdroje: ŠGÚDŠ, NLC, SVP. Orientačné, over v konaní.</div> : null}
        </div>

        <div className="rounded-lg border border-line bg-surface/50 p-3 sm:col-span-2">
          <div className="text-[11px] uppercase tracking-wide text-muted">Územný plán & zastavateľnosť{repr ? ` (parcela ${repr.parcel_no})` : ""}</div>
          {regUsed ? (
            <>
              <div className="mt-1 text-[13px] text-fg">{regUsed.name} <span className="text-muted">· {regUsed.kategoria} · {regSource}</span></div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[12px] text-muted">
                <span>IZP {regUsed.izp}</span><span>IPP {regUsed.ipp}</span><span>KZ {regUsed.kz}</span>
              </div>
              {dev && dev.buildable ? (
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[12px]">
                  <span className="text-muted">Zastavateľná: <b className="text-fg">{m2(dev.izpArea)}</b></span>
                  <span className="text-muted">HPP: <b className="text-fg">{m2(dev.hpp)}</b></span>
                  <span className="text-muted">{lowDensity ? "~ RD jednotiek" : "~ bytov"}: <b className="text-fg">{lowDensity ? Math.max(1, Math.round(dev.izpArea / 120)) : dev.byty}</b></span>
                  <span className="text-muted">GDV: <b className="text-fg">{eur(dev.ekonomika.gdv)} €</b></span>
                  <span className="text-muted">náklady: <b className="text-fg">{eur(dev.ekonomika.naklady)} €</b></span>
                  <span className="text-muted">marža: <b className="text-fg">{dev.ekonomika.marzaPct} %</b></span>
                </div>
              ) : (
                <div className="mt-1 text-[12px] text-muted">Podľa proxy/ÚP nezastavateľné alebo bez rozvojového potenciálu.</div>
              )}
              <div className="mt-1 text-[10px] text-muted">Orientačné ({lowDensity ? "IBV/RD" : "bytový dom"} · predaj {devOpts.predajEurM2} €/m² ČPP, náklady {devOpts.nakladyEurM2Hpp} €/m² HPP). Presné regulatívy dopĺňa analytik z ÚP.</div>
            </>
          ) : (
            <div className="mt-1 text-sm text-muted">Bez regulatívu pre reprezentatívnu parcelu.</div>
          )}
        </div>

        <div className="rounded-lg border border-line bg-surface/50 p-3 sm:col-span-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] uppercase tracking-wide text-muted">Dostupnosť (dojazd autom)</div>
            {!acc ? <button onClick={loadAcc} disabled={accBusy || !repr} className="rounded-md border border-line px-2 py-0.5 text-xs text-fg hover:border-ink disabled:opacity-50">{accBusy ? "…" : "Načítať"}</button> : null}
          </div>
          {acc ? (
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[12px] text-muted">
              {accItem("obchod", acc.amenities?.obchod)}
              {accItem("škola", acc.amenities?.skola)}
              {accItem("lekár", acc.amenities?.lekar)}
              {accItem("diaľnica", acc.infra?.dialnica)}
              {accItem("vlak", acc.transport?.vlak)}
              {accItem("autobus", acc.transport?.autobus)}
            </div>
          ) : <div className="mt-1 text-[12px] text-muted">Najbližší obchod, škola, diaľnica, vlak — cez OSM (na požiadanie).</div>}
        </div>
      </div>
    </Section>
  );
}

const SEV_STYLE: Record<string, { label: string; style: { borderColor: string; color: string; background: string } }> = {
  high: { label: "vysoká", style: { borderColor: "#d1a1a1", color: "#9b2c2c", background: "#fbeaea" } },
  med: { label: "stredná", style: { borderColor: "#d9c07a", color: "#8a6d1f", background: "#faf4e2" } },
  low: { label: "nízka", style: { borderColor: "#cfc8bb", color: "#6b6b6b", background: "#f3efe6" } },
};
const DIFF_LABEL: Record<string, string> = { high: "vysoká náročnosť", med: "stredná náročnosť", low: "nízka náročnosť" };

// Vysporiadanie & odkup podielov — klasifikácia issues + § postup (kurátorované) + kalkulačka odkupu (owner-sensitive).
function LvSettlementSection({ datasetId, lvNo, role }: { datasetId: string; lvNo: number; role: Role }) {
  const [d, setD] = useState<Awaited<ReturnType<typeof getLvSettlement>> | null>(null);
  const [openType, setOpenType] = useState<string | null>(null);
  useEffect(() => {
    let alive = true; setD(null); setOpenType(null);
    getLvSettlement({ data: { datasetId, lvNo, role } }).then((r) => { if (alive) setD(r); }).catch(() => {});
    return () => { alive = false; };
  }, [datasetId, lvNo, role]);
  if (!d) return null;
  const hasBuyout = d.access === "full" && d.owners.length > 0;
  if (d.issues.length === 0 && !hasBuyout) return null;
  const pct = (f: number | null) => (f == null ? "—" : (f * 100).toLocaleString("sk-SK", { maximumFractionDigits: 2 }) + " %");

  return (
    <Section title="Vysporiadanie & odkup podielov — orientačné (interné)">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="text-muted">Náročnosť: <b className="text-fg">{DIFF_LABEL[d.difficulty]}</b></span>
        <span className="text-muted">Potenciál: <b className="text-fg tabular-nums">{d.potential_score}</b>/100</span>
      </div>

      {d.issues.length ? (
        <div className="mt-2 space-y-1.5">
          {d.issues.map((it, i) => {
            const g = d.guides[it.type];
            return (
              <div key={i} className="rounded-md border border-line bg-surface/40 p-2">
                <div className="flex items-center gap-2">
                  <span className="rounded-full border px-1.5 py-0.5 text-[10px]" style={SEV_STYLE[it.severity]?.style}>{SEV_STYLE[it.severity]?.label}</span>
                  <span className="text-[13px] font-medium text-fg">{g?.nazov ?? it.type}</span>
                  {g ? <button onClick={() => setOpenType(openType === it.type ? null : it.type)} className="ml-auto text-[11px] text-muted underline-offset-2 hover:text-fg hover:underline">{openType === it.type ? "skryť §" : "§ postup"}</button> : null}
                </div>
                <div className="mt-0.5 text-[12px] text-muted">{it.note}</div>
                {openType === it.type && g ? (
                  <div className="mt-1 rounded border border-line bg-paper p-2 text-[12px]">
                    <div className="text-muted">{g.zakony.join(" · ")}</div>
                    <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-fg">{g.postup.map((s, j) => <li key={j}>{s}</li>)}</ol>
                    <div className="mt-1 text-[11px] text-muted">⚠ {g.upozornenie}</div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {d.steps.length ? (
        <div className="mt-2 text-[12px]">
          <div className="text-[11px] uppercase tracking-wide text-muted">Navrhované kroky</div>
          <ol className="mt-0.5 list-decimal space-y-0.5 pl-4 text-fg">{d.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
        </div>
      ) : null}

      {hasBuyout ? (
        <div className="mt-3">
          <div className="text-[11px] uppercase tracking-wide text-muted">Odkup podielov (AVM hodnota LV {d.avm_eur != null ? `~ ${eur(d.avm_eur)} €` : "—"})</div>
          <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-[12px]">
            <span className="text-muted">50 %: <b className="text-fg">{d.scenarios.majority != null ? eur(d.scenarios.majority) + " €" : "—"}</b></span>
            <span className="text-muted">2/3: <b className="text-fg">{d.scenarios.qualified != null ? eur(d.scenarios.qualified) + " €" : "—"}</b></span>
            <span className="text-muted">100 % súkromné: <b className="text-fg">{d.scenarios.full != null ? eur(d.scenarios.full) + " €" : "—"}</b></span>
            <span className="text-muted">súkromný podiel: <b className="text-fg">{pct(d.private_share)}</b></span>
            {d.spf_share > 0 ? <span className="text-muted">SPF/štát: <b className="text-fg">{pct(d.spf_share)}</b> (zvlášť)</span> : null}
          </div>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-muted">
                <th className="px-2 py-1 font-medium">Vlastník</th><th className="px-2 py-1 font-medium">Podiel</th><th className="px-2 py-1 font-medium">Odhad odkupu</th>
              </tr></thead>
              <tbody className="divide-y divide-line">
                {d.owners.map((o, i) => (
                  <tr key={i}>
                    <td className="px-2 py-1 text-fg">{o.name}{o.is_state ? <span className="ml-1 text-[10px] text-muted">(SPF/štát)</span> : o.is_company ? <span className="ml-1 text-[10px] text-muted">(firma)</span> : null}</td>
                    <td className="px-2 py-1 font-mono tabular-nums text-fg">{o.share_str ?? "—"}{o.small ? <span className="ml-1 text-[10px] text-muted">malý</span> : null}</td>
                    <td className="px-2 py-1 tabular-nums text-fg">{o.is_state ? "— (cez SPF)" : o.est_eur != null ? eur(o.est_eur) + " €" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-1 text-[10px] text-muted">Odhad = AVM hodnota LV × podiel. Malé podiely (&lt;5 %) so zľavou za fragmentáciu (×0,7). SPF/štát zvlášť (proces cez SPF). Rešpektuj predkupné právo (§ 140).</div>
        </div>
      ) : d.access !== "full" ? (
        <div className="mt-2 rounded-md border border-line bg-surface-2/40 px-3 py-2 text-sm text-muted">Odkup podielov (mená + odhady) — rola <b className="text-fg">{role}</b> nemá plný prístup.</div>
      ) : null}

      <div className="mt-2 text-[10px] text-muted">{d.disclaimer}</div>
    </Section>
  );
}

const CHANGE_LABEL: Record<string, string> = {
  owner_added: "Pribudol vlastník", owner_removed: "Ubudol vlastník", owner_changed: "Zmena vlastníka",
  share_changed: "Zmena podielu", tarcha_added: "Pribudla ťarcha", tarcha_removed: "Zanikla ťarcha",
  title_changed: "Zmena titulu", parcel_added: "Pribudla parcela", parcel_removed: "Ubudla parcela",
  area_changed: "Zmena výmery", lv_added: "Nový LV", lv_removed: "Zrušený LV", drp_changed: "Zmena druhu pozemku",
};
const IMP_STYLE: Record<string, { label: string; style: { borderColor: string; color: string; background: string } }> = {
  high: { label: "dôležitá", style: { borderColor: "#d1a1a1", color: "#9b2c2c", background: "#fbeaea" } },
  normal: { label: "bežná", style: { borderColor: "#cfc8bb", color: "#6b6b6b", background: "#f3efe6" } },
  low: { label: "drobná", style: { borderColor: "#cfc8bb", color: "#8a8a8a", background: "#f6f3ec" } },
};
const ENTITY_LABEL: Record<string, string> = { owner: "Vlastník", share: "Podiel", tarcha: "Ťarcha", title: "Titul", parcel: "Parcela", lv: "LV", assets: "Majetok" };

// História zmien v katastri (change_log) — detekcia starý↔nový stav pri importoch. Fail-soft pred 0065.
function LvHistorySection({ datasetId, lvNo }: { datasetId: string; lvNo: number }) {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof getChanges>> | null>(null);
  useEffect(() => {
    let alive = true; setRows(null);
    getChanges({ data: { datasetId, lvNo } }).then((r) => { if (alive) setRows(r); }).catch(() => { if (alive) setRows([]); });
    return () => { alive = false; };
  }, [datasetId, lvNo]);
  if (!rows || rows.length === 0) return null; // kým nie sú zaznamenané zmeny, sekcia sa nezobrazuje
  const fmtDate = (s: string) => { const t = s.slice(0, 10); return t || s; };
  return (
    <Section title="História zmien v katastri — interné (detekcia medzi importmi)">
      <div className="space-y-1.5">
        {rows.map((r) => {
          const imp = IMP_STYLE[r.importance] ?? IMP_STYLE.normal;
          const label = CHANGE_LABEL[r.change_type] ?? r.change_type;
          const hasVal = r.old_value != null || r.new_value != null;
          return (
            <div key={r.id} className="rounded-md border border-line bg-surface/40 p-2">
              <div className="flex items-center gap-2">
                <span className="rounded-full border px-1.5 py-0.5 text-[10px]" style={imp.style}>{imp.label}</span>
                <span className="text-[13px] font-medium text-fg">{label}</span>
                <span className="text-[11px] text-muted">{ENTITY_LABEL[r.entity] ?? r.entity}{r.field ? ` · ${r.field}` : ""}{r.parcel_no ? ` · parcela ${r.parcel_no}` : ""}</span>
                <span className="ml-auto text-[11px] tabular-nums text-muted">{fmtDate(r.detected_at)}</span>
              </div>
              {hasVal ? (
                <div className="mt-0.5 text-[12px] text-muted">
                  {r.old_value != null ? <span className="line-through">{r.old_value}</span> : null}
                  {r.old_value != null && r.new_value != null ? <span className="mx-1">→</span> : null}
                  {r.new_value != null ? <b className="text-fg">{r.new_value}</b> : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="mt-2 text-[10px] text-muted">Zmeny sa zaznamenávajú pri kanonickom importe (starý ↔ nový stav LV/parciel/vlastníkov/ťarch/titulov). Dôležité zmeny idú aj do alertov (in-app + Telegram). Pracovný nástroj, nie úradný záznam.</div>
    </Section>
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
