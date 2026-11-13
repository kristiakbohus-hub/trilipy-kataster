// ŽIADOSTI K NEHNUTEĽNOSTI (2026-11-13) — predvyplnené koncepty na tlač: vyjadrenie k existencii sietí (elektrina, plyn,
// voda/kanalizácia, telekomunikácie) a územnoplánovacia informácia od obce. Identifikácia nehnuteľnosti z katastra;
// údaje žiadateľa sa NEDOPĹŇAJÚ (vyplní ich používateľ ručne). Nič sa neodosiela — len tlač / PDF.
// BEZ `loader` (pamäť cf_app_ssr_loader_leak): dáta až po prihlásení.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { getPropertyCore, type PropertyCore, listPropertyRequests, savePropertyRequest, type PropertyRequest } from "../lib/api/kataster.functions";
import { useAuth } from "../lib/auth-context";
import { addressOf, fact } from "../lib/property-eval";

type Search = { ds?: string; p?: string; lv?: string };
export const Route = createFileRoute("/ziadosti")({
  head: () => ({ meta: [{ title: "Žiadosti k nehnuteľnosti — TRI LIPY" }] }),
  validateSearch: (s: Record<string, unknown>): Search => ({
    ds: typeof s.ds === "string" ? s.ds : undefined,
    p: typeof s.p === "string" || typeof s.p === "number" ? String(s.p) : undefined,
    lv: typeof s.lv === "string" || typeof s.lv === "number" ? String(s.lv) : undefined,
  }),
  component: RequestsPage,
});

const today = () => new Date().toLocaleDateString("sk-SK", { day: "numeric", month: "long", year: "numeric" });
const Blank = ({ w = "60mm" }: { w?: string }) => <span className="inline-block border-b border-dotted border-fg/60 align-bottom" style={{ width: w }}>&nbsp;</span>;

function Letter({ to, subject, children, c }: { to: string[]; subject: string; children: ReactNode; c: PropertyCore }) {
  return (
    <article className="zi-letter mx-auto max-w-3xl space-y-4 rounded-lg border border-line bg-paper p-8 text-[13px] leading-relaxed print:rounded-none print:border-0 print:p-0">
      <div className="space-y-0.5 text-[12px]">
        <div className="font-medium">Žiadateľ:</div>
        <div>Meno a priezvisko / obchodné meno: <Blank w="90mm" /></div>
        <div>Adresa: <Blank w="110mm" /></div>
        <div>Telefón: <Blank w="45mm" /> E-mail: <Blank w="55mm" /></div>
      </div>
      <div className="ml-auto w-fit text-[12px]">{to.map((t, i) => <div key={i} className={i === 0 ? "font-medium" : ""}>{t}</div>)}</div>
      <div className="text-right text-[12px]">V <Blank w="35mm" /> dňa {today()}</div>
      <h2 className="text-[14px] font-semibold">Vec: {subject}</h2>
      {children}
      <Ident c={c} />
      <div className="pt-6 text-[12px]">S pozdravom<div className="mt-10 w-60 border-t border-fg/60 pt-1 text-muted">podpis žiadateľa</div></div>
      <div className="text-[11px] text-muted">Prílohy: kópia z katastrálnej mapy so zakreslením pozemku; situácia zámeru (ak je k dispozícii); plnomocenstvo (ak žiada splnomocnenec).</div>
    </article>
  );
}
function Ident({ c }: { c: PropertyCore }) {
  const ps = c.parcels.slice(0, 20); const a = addressOf(c);
  return (
    <table className="w-full text-[12px]">
      <tbody>
        <tr><td className="w-48 py-0.5 text-muted">Katastrálne územie</td><td>{(c.dataset?.ku_name ?? "").replace(/^k\.ú\.\s*/i, "")} ({c.dataset?.ku_code ?? "—"}), okres {c.dataset?.okres ?? "—"}</td></tr>
        <tr><td className="py-0.5 text-muted">Parcely</td><td>{ps.map((p) => `${p.register === "E" ? "E-KN" : "C-KN"} ${p.parcel_no}${p.area_m2 ? ` (${Math.round(p.area_m2)} m², ${p.use_type ?? "—"})` : ""}`).join("; ")}{c.parcels.length > 20 ? " …" : ""}</td></tr>
        <tr><td className="py-0.5 text-muted">List vlastníctva</td><td>{c.lvs.join(", ") || "—"}</td></tr>
        {a?.adresa ? <tr><td className="py-0.5 text-muted">Adresa (orientačne)</td><td>{String(a.adresa)}</td></tr> : null}
        {c.main.lat != null && c.main.lng != null ? <tr><td className="py-0.5 text-muted">Súradnice (WGS84)</td><td>{c.main.lat.toFixed(5)}, {c.main.lng.toFixed(5)}</td></tr> : null}
        <tr><td className="py-0.5 text-muted">Účel</td><td><Blank w="110mm" /> (napr. kúpa pozemku, projekt rodinného domu)</td></tr>
      </tbody>
    </table>
  );
}

function RequestsPage() {
  const s = Route.useSearch();
  const { token } = useAuth();
  const [c, setC] = useState<PropertyCore | null>(null);
  useEffect(() => {
    if (!token || !s.ds || !(s.p || s.lv)) return;
    getPropertyCore({ data: { token, datasetId: s.ds, kind: s.p ? "parcela" : "lv", ref: (s.p ?? s.lv) as string } }).then(setC).catch(() => setC(null));
  }, [token, s.ds, s.p, s.lv]);
  if (!token) return <div className="p-6 text-sm text-muted">Prihlás sa.</div>;
  if (!s.ds || !(s.p || s.lv)) return <div className="p-6 text-sm text-muted">Žiadosti sa otvárajú z listu nehnuteľnosti. <Link to="/nehnutelnost" className="text-brand underline">List nehnuteľnosti</Link></div>;
  if (!c) return <div className="p-6 text-sm text-muted">Pripravujem žiadosti…</div>;
  if (!c.ok) return <div className="p-6 text-sm text-muted">{c.message ?? "Nehnuteľnosť sa nenašla."}</div>;
  const obec = String(fact(c, "obec", `ku:${c.dataset?.ku_code ?? ""}`)?.obec ?? (c.dataset?.ku_name ?? "").replace(/^k\.ú\.\s*/i, ""));
  const vod = String(fact(c, "obec", `ku:${c.dataset?.ku_code ?? ""}`)?.vodovod_prevadzkovatel ?? "prevádzkovateľ verejného vodovodu a kanalizácie v obci");
  const siete: [string[], string, string][] = [
    [["Stredoslovenská distribučná, a.s.", "(podanie cez portál distribučnej spoločnosti alebo na adresu z jej webu)"], "elektrické vedenia (VN, NN) a zariadenia distribučnej sústavy", "elektrina"],
    [["SPP - distribúcia, a.s.", "(podanie elektronicky cez portál alebo na adresu z webu)"], "plynárenské zariadenia (plynovody, prípojky)", "plyn"],
    [[vod, "(adresa podľa webu prevádzkovateľa)"], "vodovodné a kanalizačné siete a prípojky", "voda"],
    [["Slovak Telekom, a.s.", "(žiadosť cez portál vyjadrení k sieťam)"], "telekomunikačné siete", "telekom_st"],
    [["Orange Slovensko, a.s.", "(žiadosť cez portál vyjadrení k sieťam)"], "telekomunikačné siete", "telekom_orange"],
  ];
  // evidencia sa viaže na hlavnú parcelu listu (rovnaký kľúč číta list nehnuteľnosti), inak na LV
  const ref = c.main.parcelNo ? `p:${c.main.parcelNo}` : c.lvs[0] != null ? `lv:${c.lvs[0]}` : null;
  return (
    <div className="space-y-6 px-4 py-5 print:space-y-0 print:p-0">
      <style>{`@media print { .zi-letter { break-after: page; font-family: "Montserrat", sans-serif; } .no-print, nav, aside, header.app, footer { display: none !important; } @page { size: A4; margin: 20mm 18mm; } }`}</style>
      <div className="no-print mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-muted">Koncepty na tlač — údaje žiadateľa doplňte ručne. Nič sa automaticky neodosiela. Adresy a portály správcov overte na ich weboch.</span>
        <button onClick={() => window.print()} className="rounded-md bg-ink px-3 py-1.5 font-medium text-cream">Tlačiť všetky</button>
      </div>
      {siete.map(([to, what, kind]) => (
        <div key={to[0]} className="space-y-2">
          <Letter to={to} c={c} subject="Žiadosť o vyjadrenie k existencii podzemných a nadzemných vedení">
            <p>Žiadam o vyjadrenie k existencii sietí a zariadení vo Vašej správe — {what} — na nižšie uvedených pozemkoch a v ich bezprostrednom okolí, vrátane ich ochranných a bezpečnostných pásiem a podmienok pripojenia.</p>
          </Letter>
          {ref && c.dataset ? <Tracker datasetId={c.dataset.id} reqRef={ref} kind={kind} /> : null}
        </div>
      ))}
      <div className="space-y-2">
        <Letter to={[`Obec / mesto ${obec}`, "stavebný úrad / referát územného plánovania"]} c={c} subject="Žiadosť o územnoplánovaciu informáciu">
          <p>Žiadam o územnoplánovaciu informáciu k nižšie uvedeným pozemkom podľa platnej územnoplánovacej dokumentácie obce: funkčné využitie územia, regulatívy (zastavanosť, podlažnosť, odstupy), prípustné a neprípustné stavby, verejnoprospešné stavby a prípadné prebiehajúce zmeny a doplnky územného plánu.</p>
        </Letter>
        {ref && c.dataset ? <Tracker datasetId={c.dataset.id} reqRef={ref} kind="up_obec" /> : null}
      </div>
    </div>
  );
}


// ——— Evidencia žiadosti (0113): odoslanie, odpoveď, výsledok a stručný obsah → ukáže sa v liste nehnuteľnosti ———
function Tracker({ datasetId, reqRef, kind }: { datasetId: string; reqRef: string; kind: string }) {
  const { token } = useAuth();
  const [r, setR] = useState<Record<string, string | null>>({ status: "pripravena" });
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!token) return;
    listPropertyRequests({ data: { token, datasetId, ref: reqRef } })
      .then((x) => { const f: PropertyRequest | undefined = x.rows.find((y) => y.kind === kind); if (f) setR({ ...f }); }).catch(() => undefined);
  }, [token, datasetId, reqRef, kind]);
  const set = (k: string, v: string) => setR((o) => ({ ...o, [k]: v || null }));
  const save = async () => {
    if (!token) return;
    setMsg("Ukladám…");
    const res = await savePropertyRequest({ data: { token, datasetId, ref: reqRef, kind: kind as never, status: (r.status ?? "pripravena") as never,
      sentAt: r.sentAt ?? null, answeredAt: r.answeredAt ?? null, outcome: (r.outcome ?? null) as never, summary: r.summary ?? null, refNo: r.refNo ?? null, validUntil: r.validUntil ?? null } }).catch(() => ({ ok: false, message: "Uloženie zlyhalo." }));
    setMsg(res.ok ? "Uložené — odpoveď sa zobrazí v liste nehnuteľnosti." : (res.message ?? "Uloženie zlyhalo."));
  };
  const inp = "rounded-md border border-line bg-surface px-2 py-1 text-xs text-fg";
  return (
    <div className="no-print mx-auto max-w-3xl rounded-lg border border-dashed border-line bg-surface-2/40 p-3 text-xs">
      <div className="mb-2 font-medium text-fg">Evidencia tejto žiadosti</div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-muted">Stav<br />
          <select className={inp} value={r.status ?? "pripravena"} onChange={(e) => set("status", e.target.value)}>
            <option value="pripravena">pripravená</option><option value="odoslana">odoslaná</option><option value="odpoved">odpoveď prišla</option><option value="bez_odpovede">bez odpovede</option>
          </select></label>
        <label className="text-muted">Odoslaná<br /><input type="date" className={inp} value={r.sentAt ?? ""} onChange={(e) => set("sentAt", e.target.value)} /></label>
        <label className="text-muted">Odpoveď zo dňa<br /><input type="date" className={inp} value={r.answeredAt ?? ""} onChange={(e) => set("answeredAt", e.target.value)} /></label>
        <label className="text-muted">Výsledok<br />
          <select className={inp} value={r.outcome ?? ""} onChange={(e) => set("outcome", e.target.value)}>
            <option value="">—</option><option value="ok">bez prekážok</option><option value="pozor">s podmienkami</option><option value="riziko">prekážka</option>
          </select></label>
        <label className="text-muted">Číslo vyjadrenia<br /><input className={inp} value={r.refNo ?? ""} onChange={(e) => set("refNo", e.target.value)} /></label>
        <label className="text-muted">Platí do<br /><input type="date" className={inp} value={r.validUntil ?? ""} onChange={(e) => set("validUntil", e.target.value)} /></label>
      </div>
      <label className="mt-2 block text-muted">Stručný obsah odpovede (bežnou rečou, bez mien a osobných údajov)
        <textarea className={inp + " mt-0.5 w-full"} rows={2} maxLength={600} value={r.summary ?? ""} onChange={(e) => set("summary", e.target.value)} placeholder="napr. na pozemku nie sú plynárenské zariadenia; NTL plynovod v ceste vo vzdialenosti 6 m" />
      </label>
      <div className="mt-2 flex items-center gap-3">
        <button type="button" onClick={save} className="rounded-md bg-ink px-3 py-1 font-medium text-cream">Uložiť evidenciu</button>
        {msg ? <span className="text-muted">{msg}</span> : null}
      </div>
    </div>
  );
}
