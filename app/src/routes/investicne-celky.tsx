import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { getScenarioVariantRows, type ScenarioKey, type ScenarioSchema, type ScenarioVariant } from "../lib/api/kataster.functions";
import { Card, CriteriaMatrix, Disclaimer, SectionHeader, Stat } from "../components/kit";
import { ScenarioSwitches, variantParams } from "../components/scenario-switches";
import { kuLabel } from "../lib/domain";
import { ReasonFilter, reasonCounts, reasonFromKeys } from "../components/reason-filter";
import { SketchSvg, type Sketch } from "../components/subdivision-sketch";

// INVESTIČNÉ CELKY (2026-11-21) — skupina zlatých scenárov GOLD-13 (zostavy susedných parciel), GOLD-24 (súhlasy
// vlastníkov), GOLD-07 (veľké celky a podiely), GOLD-29 (väzby areálov), GOLD-08 (garáže a malé pozemky).
// Enginy 21_NL_SEARCH/gold{13,24,07,29,08}_find.py + _live.py; výsledky žijú len ako varianty (0117) — predvolený beh
// zakladá a po importe obnovuje Mac. Riadky sú bez mien (vlastník = typ, LV, počet osôb), vidí ich každý prihlásený.
// ZÁMERNE BEZ `loader` (SSR by dáta vložil do HTML pred prihlasovacou bránou) — dáta v useEffect.
export const Route = createFileRoute("/investicne-celky")({
  head: () => ({ meta: [{ title: "Investičné celky — TRI LIPY KATASTER CORE" }] }),
  component: InvestPage,
});

type Row = Record<string, unknown>;
const S = (r: Row, k: string): string => (r[k] === undefined || r[k] === null ? "" : String(r[k]));
const N = (r: Row, k: string): number => Number(r[k] ?? 0) || 0;
const NO = (r: Row, k: string): number | null => (r[k] === undefined || r[k] === null ? null : Number(r[k]));
const A = (r: Row, k: string): string[] => (Array.isArray(r[k]) ? (r[k] as unknown[]).map(String) : []);
const L = (r: Row, k: string): Row[] => (Array.isArray(r[k]) ? (r[k] as unknown[]).filter((x) => !!x && typeof x === "object") as Row[] : []);
const EMPTY: Row = {};
const O = (r: Row, k: string): Row | null => {
  const v = r[k];
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Row) : null;
};
const m2 = (n: number | null) => (n === null ? "—" : `${Math.round(n).toLocaleString("sk-SK")} m²`);
const m1 = (n: number | null) => (n === null ? "—" : `${n.toLocaleString("sk-SK", { maximumFractionDigits: 1 })} m`);
const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)} %`);
const pno = (ref: string) => ref.replace(/^C:/, "");
const lvs = (x: unknown) => (Array.isArray(x) ? x.map(String).join(", ") : "");
/** Slovenské skloňovanie počtu: 1 súhlas, 2–4 súhlasy, 5+ súhlasov. */
const pl = (n: number, one: string, few: string, many: string) => `${n} ${n === 1 ? one : n >= 2 && n <= 4 ? few : many}`;

function ParcelLink({ ds, refC }: { ds: string | null; refC: string }) {
  if (!ds) return <span>{pno(refC)}</span>;
  return <Link to="/nehnutelnost" search={{ ds, p: pno(refC) } as never} className="text-green hover:underline">{pno(refC)}</Link>;
}

function Parcels({ r, max = 8 }: { r: Row; max?: number }) {
  const ds = S(r, "_datasetId") || null;
  const ps = A(r, "site");
  const total = NO(r, "nParcels") ?? ps.length;
  return (
    <div className="mt-2 text-xs text-muted">
      Parcely: {ps.slice(0, max).map((p, j) => <span key={p}>{j ? ", " : ""}<ParcelLink ds={ds} refC={p} /></span>)}
      {total > max ? ` … +${total - Math.min(max, ps.length)}` : ""}
      {Array.isArray(r.pt) && ds ? (
        <> · <a className="text-green hover:underline" href={`/mapa?ds=${encodeURIComponent(ds)}&ll=${(r.pt as number[])[0]},${(r.pt as number[])[1]}`}>na mape →</a></>
      ) : null}
    </div>
  );
}

function Chip({ children, warn = false }: { children: ReactNode; warn?: boolean }) {
  return <span className={`rounded-full border border-line px-2 py-0.5 ${warn ? "text-warning" : "text-muted"}`}>{children}</span>;
}

function Tail({ r, actions }: { r: Row; actions: string[] }) {
  const notes = A(r, "notes");
  return (
    <>
      {notes.filter((n) => n.startsWith("Otvorené")).map((n, j) => <p key={j} className="mt-2 text-[11px] leading-relaxed text-warning">{n}</p>)}
      {actions.length ? (
        <details className="mt-2 text-[11px] text-muted">
          <summary className="cursor-pointer text-fg">Ďalšie kroky ({actions.length})</summary>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">{actions.map((a, j) => <li key={j}>{a}</li>)}</ul>
        </details>
      ) : null}
      <CriteriaMatrix json={(r.criteriaJson ?? null) as string | null} />
    </>
  );
}

function SketchOf({ r, label }: { r: Row; label: string }) {
  const s = O(r, "sketch");
  if (!s || typeof s.site !== "string") return null;
  return <div className="mt-3"><SketchSvg s={s as unknown as Sketch} label={label} numbered={false} /></div>;
}

const ACCESS: Record<string, string> = { direct: "priamy z cesty", documented: "cez cudzí pozemok so zapísaným vecným bremenom prechodu (rozsah overiť)",
  undocumented: "cez cudzí pozemok bez zapísaného práva", none: "bez cesty v areáli" };

// ——— karty jednotlivých scenárov ———
function Card13({ r }: { r: Row }) {
  const ds = S(r, "_datasetId") || null;
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-fg">Zostava {m2(NO(r, "areaM2"))} · {pl(N(r, "nGroups"), "okruh vlastníkov", "okruhy vlastníkov", "okruhov vlastníkov")}</div>
          <div className="text-xs text-muted">{kuLabel(S(r, "_kuName") || S(r, "kuName") || null, S(r, "kodKu"))} · použiteľných {m2(NO(r, "usableM2"))}</div>
        </div>
        <span className="shrink-0 rounded-full border border-line bg-surface-2/40 px-2 py-0.5 text-[11px] tabular-nums text-fg">{pl(N(r, "persons"), "osoba", "osoby", "osôb")}</span>
      </div>
      <SketchOf r={r} label="Náčrt zostavy: parcely farebne podľa okruhu vlastníkov, čierna čiara = styk s verejnou cestou" />
      <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
        {S(r, "zone") ? <Chip>ÚP: {S(r, "zone")}</Chip> : null}
        {NO(r, "slopePct") !== null ? <Chip>sklon {N(r, "slopePct").toLocaleString("sk-SK")} %</Chip> : null}
        {NO(r, "zuobShare") !== null ? <Chip>v ZÚ {pct(NO(r, "zuobShare"))}</Chip> : null}
        <Chip>cesta {m1(NO(r, "frontageM"))}{S(r, "access") === "private" ? " (súkromná)" : ""}</Chip>
      </div>
      <ul className="mt-3 space-y-0.5 text-[11px] text-muted">
        {L(r, "groups").slice(0, 8).map((g, i) => (
          <li key={i}>
            Okruh {i + 1}: {S(g, "typ") || "nezistený"} · {N(g, "persons")} os.{N(g, "unknown") ? ` + ${N(g, "unknown")} nezistení` : ""} · {m2(N(g, "m2"))}
            {lvs(g.lv) ? <> · LV {A(g, "lv").map((lv, j) => <span key={lv}>{j ? ", " : ""}{ds ? <a className="text-green hover:underline" href={`/vypis/${ds}/${lv}`}>{lv}</a> : lv}</span>)}</> : null}
            {g.viaE ? " · cez parcely E" : ""}
          </li>
        ))}
      </ul>
      <Parcels r={r} />
    </>
  );
}

function Card24({ r }: { r: Row }) {
  const ds = S(r, "_datasetId") || null;
  const plan = O(r, "plan") ?? EMPTY;
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-fg">Stačí {pl(N(plan, "consents"), "súhlas", "súhlasy", "súhlasov")} · {m2(NO(plan, "m2"))}</div>
          <div className="text-xs text-muted">
            {kuLabel(S(r, "_kuName") || S(r, "kuName") || null, S(r, "kodKu"))} · blok {m2(NO(r, "blockM2"))}, {pl(N(r, "totalPersons"), "osoba", "osoby", "osôb")}, {pl(N(r, "nGroups"), "okruh", "okruhy", "okruhov")}
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-line bg-surface-2/40 px-2 py-0.5 text-[11px] text-fg">
          {S(plan, "method") === "presne" ? "najlepší plán" : "odhad plánu"}
        </span>
      </div>
      <SketchOf r={r} label="Náčrt bloku: farebne parcely plánu podľa okruhu vlastníkov, sivé ostatné, čierna čiara = styk s verejnou cestou" />
      <ul className="mt-3 space-y-0.5 text-[11px] text-muted">
        {L(plan, "groups").map((g, i) => (
          <li key={i}>
            Okruh {i + 1}: {S(g, "typ") || "nezistený"} · {N(g, "persons")} os.{N(g, "unknown") ? ` + ${N(g, "unknown")} nezistení` : ""} · {m2(N(g, "m2"))}
            {lvs(g.lv) ? <> · LV {A(g, "lv").map((lv, j) => <span key={lv}>{j ? ", " : ""}{ds ? <a className="text-green hover:underline" href={`/vypis/${ds}/${lv}`}>{lv}</a> : lv}</span>)}</> : null}
            {" · "}{g.critical ? <span className="text-warning">bez náhrady</span> : NO(g, "replaceConsents") !== null ? `náhrada: ${pl(N(g, "replaceConsents"), "súhlas", "súhlasy", "súhlasov")}` : "náhrada nespočítaná"}
          </li>
        ))}
      </ul>
      <div className="mt-2 text-xs text-muted">
        Parcely plánu: {A(plan, "parcels").slice(0, 10).map((p, j) => <span key={p}>{j ? ", " : ""}<ParcelLink ds={ds} refC={p} /></span>)}
      </div>
    </>
  );
}

function Card07({ r }: { r: Row }) {
  const dom = S(r, "kind") === "DOMINANT";
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-fg">Celok {m2(NO(r, "areaM2"))} · {pl(N(r, "nCoowners"), "spoluvlastník", "spoluvlastníci", "spoluvlastníkov")}</div>
          <div className="text-xs text-muted">
            {kuLabel(S(r, "_kuName") || S(r, "kuName") || null, S(r, "kodKu"))} · {pl(N(r, "nParcels"), "parcela", "parcely", "parciel")} na {N(r, "nLvs")} LV
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-line bg-surface-2/40 px-2 py-0.5 text-[11px] text-fg">
          {dom ? `dominantný podielnik ${pct(NO(r, "maxShare"))}` : `najväčší podiel ${pct(NO(r, "maxShare"))}`}
        </span>
      </div>
      <SketchOf r={r} label="Náčrt celku: parcely farebne podľa LV, čierna čiara = styk s verejnou cestou" />
      <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
        {NO(r, "majorityK") !== null ? <Chip>na väčšinu treba {pl(N(r, "majorityK"), "osoba", "osoby", "osôb")}</Chip> : null}
        {N(r, "nUnknown") ? <Chip warn>nezistení: {N(r, "nUnknown")}</Chip> : null}
        {N(r, "tiny") ? <Chip>drobné podiely: {N(r, "tiny")}</Chip> : null}
        {N(r, "publicCoowner") ? <Chip>obec/štát/SPF: {N(r, "publicCoowner")}</Chip> : null}
        {S(r, "zone") ? <Chip>ÚP: {S(r, "zone")}</Chip> : null}
        <Chip>cesta {m1(NO(r, "frontageM"))}</Chip>
      </div>
      <ul className="mt-3 space-y-1 text-[11px]">
        {L(r, "variants").map((v, i) => (
          <li key={i}>
            <span className={v.feasible ? "text-green" : "text-muted"}>{v.feasible ? "možné" : "nie"}</span>
            <span className="text-fg"> · {S(v, "label")}</span>
            <span className="text-muted"> — {S(v, "detail")}</span>
            {S(v, "uncertainty") ? <div className="pl-3 text-muted">{S(v, "uncertainty")}</div> : null}
          </li>
        ))}
      </ul>
      <Parcels r={r} />
    </>
  );
}

function Card29({ r }: { r: Row }) {
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-fg">Areál {m2(NO(r, "areaM2"))} · {pl(N(r, "nBuildings"), "stavba", "stavby", "stavieb")} · {pl(N(r, "nCircles"), "okruh", "okruhy", "okruhov")}</div>
          <div className="text-xs text-muted">{kuLabel(S(r, "_kuName") || S(r, "kuName") || null, S(r, "kodKu"))} · {pl(N(r, "nParcels"), "parcela", "parcely", "parciel")}</div>
        </div>
      </div>
      <SketchOf r={r} label="Náčrt areálu: parcely farebne podľa okruhu vlastníkov, tmavé pôdorysy budov, čierna čiara = styk s verejnou cestou" />
      <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
        <Chip warn={N(r, "nForeign") > 0}>stavby na cudzom pozemku: {N(r, "nForeign")}</Chip>
        <Chip>spoločné cesty: {N(r, "nSharedRoads")}</Chip>
        <Chip>vecné bremená: {N(r, "nEasements")}</Chip>
        {N(r, "unregistered") ? <Chip warn>budovy v ZBGIS bez zápisu: {N(r, "unregistered")}</Chip> : null}
      </div>
      <ul className="mt-3 space-y-0.5 text-[11px] text-muted">
        {L(r, "circles").slice(0, 6).map((c, i) => (
          <li key={i}>
            Okruh {i + 1}: {S(c, "typ") || "nezistený"} · stavby {N(c, "stavby")} · pozemky {m2(N(c, "m2"))}
            {N(c, "stavby") ? <> · prístup: <span className={S(c, "access") === "undocumented" || S(c, "access") === "none" ? "text-warning" : ""}>{ACCESS[S(c, "access")] ?? S(c, "access")}</span></> : null}
          </li>
        ))}
      </ul>
      {L(r, "links").length ? (
        <details className="mt-2 text-[11px] text-muted">
          <summary className="cursor-pointer text-fg">Väzby ({L(r, "links").length})</summary>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {L(r, "links").slice(0, 20).map((k, j) => (
              <li key={j}>{S(k, "typ")}: {S(k, "from")}{S(k, "to") ? ` → ${S(k, "to")}` : ""}{k.documented ? "" : " (nedoložené)"}</li>
            ))}
          </ul>
        </details>
      ) : null}
      <Parcels r={r} />
    </>
  );
}

function Card08({ r }: { r: Row }) {
  const fits = L(r, "variants").filter((v) => v.fits);
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-fg">Malý pozemok {m2(NO(r, "areaM2"))} · šírka do {m1(NO(r, "widthM"))}</div>
          <div className="text-xs text-muted">{kuLabel(S(r, "_kuName") || S(r, "kuName") || null, S(r, "kodKu"))} · vjazd {m1(NO(r, "frontageM"))}</div>
        </div>
        <span className="shrink-0 rounded-full border border-line bg-surface-2/40 px-2 py-0.5 text-[11px] tabular-nums text-fg">
          {pl(N(r, "flatsNear"), "byt", "byty", "bytov")} v okolí
        </span>
      </div>
      <SketchOf r={r} label="Náčrt pozemku: obdĺžniky garáží kolmo na cestu, čierna čiara = styk s cestou" />
      <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
        {fits.map((v, i) => <Chip key={i}>{S(v, "label")}</Chip>)}
        {S(r, "roadClass") ? <Chip>cesta: {S(r, "roadClass")}</Chip> : null}
        {A(r, "opZones").map((z) => <Chip key={z} warn>OP: {z}</Chip>)}
        {S(r, "zone") ? <Chip>ÚP: {S(r, "zone")}</Chip> : null}
        {S(r, "ownerType") ? <Chip>vlastník: {S(r, "ownerType")}</Chip> : null}
        {N(r, "garagesNear") ? <Chip>garáže v okolí: {N(r, "garagesNear")}</Chip> : null}
      </div>
      <Parcels r={r} />
    </>
  );
}

type Def = {
  sc: ScenarioKey; tab: string; title: string; intro: string; card: (p: { r: Row }) => ReactNode;
  reasons: Record<string, string>; textReasons: [RegExp, string][];
  stat: (matches: Row[]) => { label: string; value: ReactNode }[]; sort: (a: Row, b: Row) => number; disclaimer: string;
  actions: string[];
};

const DEFS: Def[] = [
  {
    sc: "GOLD13", tab: "Zostavy parciel", title: "Susedné parcely ako investičný celok", card: Card13,
    intro: "Súvislé skupiny susedných parciel rôznych vlastníkov, ktoré spolu tvoria väčšiu využiteľnú plochu (typicky úzke pásy polí). "
      + "Súvislosť len cez spoločnú hranicu (dotyk v bode sa neráta), použiteľná plocha po odrátaní úzkych výbežkov, prístup z verejnej cesty, ÚP, sklon "
      + "a počet osôb, ktorých súhlas by bol treba. Zostava rastie tak, aby pribudlo čo najmenej nových vlastníkov.",
    reasons: { zone_housing: "ÚP", owners_identified: "vlastníci", site_access: "prístup", passage_easement: "vecné bremeno",
      geometry_valid: "geometria", slope_limit: "sklon", temporal_consistency: "dátum zdrojov" },
    textReasons: [[/územný plán|regulatív/, "ÚP"], [/vlastník|totožnosť/, "vlastníci"]],
    stat: (ms) => [{ label: "Zhody", value: ms.length }, { label: "Plocha zhôd", value: m2(ms.reduce((t, r) => t + N(r, "areaM2"), 0)) }],
    sort: (a, b) => N(b, "score") - N(a, "score") || N(a, "persons") - N(b, "persons") || N(b, "usableM2") - N(a, "usableM2"),
    actions: ["overiť regulatív ÚP pre celú zostavu (zastavanosť, uličná čiara, dopravné napojenie)", "výpisy LV všetkých okruhov vlastníkov a ťarchy",
      "obhliadka: terén, oplotenia, užívanie pásov susedmi", "poradie oslovenia podľa karty Súhlasy vlastníkov (najmenej potrebných súhlasov)"],
    disclaimer: "Zostava je dátový návrh z mapy KN a katastra — nepredpokladá ochotu vlastníkov predať ani cenu. Vlastníci sú uvedení typom, "
      + "počtom osôb a číslom LV, nie menom. Regulatív ÚP, siete a dopravné napojenie overiť pred akýmkoľvek krokom.",
  },
  {
    sc: "GOLD24", tab: "Súhlasy vlastníkov", title: "Vyjednávacia zložitosť — najmenej potrebných súhlasov", card: Card24,
    intro: "V každom bloku susedných parciel hľadá plán s najmenším počtom osôb, ktorých parcely spolu dajú súvislú plochu so vjazdom z verejnej cesty. "
      + "Tá istá osoba na viacerých LV sa ráta raz. Pri každom okruhu plánu je uvedené, či má náhradu (a koľko súhlasov by stála), alebo je bez náhrady. "
      + "Do 14 okruhov sa preverujú všetky kombinácie, nad tým je plán odhad.",
    reasons: { plan_owners_identified: "vlastníci plánu", geometry_valid: "geometria", temporal_consistency: "dátum zdrojov" },
    textReasons: [[/nezisten|parciel E/, "vlastníci plánu"]],
    stat: (ms) => [{ label: "Plány v limite", value: ms.length },
      { label: "Najmenej súhlasov", value: ms.length ? Math.min(...ms.map((r) => N(O(r, "plan") ?? EMPTY, "consents"))) : "—" }],
    sort: (a, b) => N(b, "score") - N(a, "score") || N(O(a, "plan") ?? EMPTY, "consents") - N(O(b, "plan") ?? EMPTY, "consents"),
    actions: ["výpisy LV okruhov plánu (najprv okruhy bez náhrady)", "overiť regulatív ÚP pre plochu plánu",
      "pri pozemkoch obce, štátu alebo SPF zistiť postup prevodu u vlastníka (zastupiteľstvo, SPF)"],
    disclaimer: "Plán počíta len počet potrebných súhlasov — nie ochotu vlastníkov ani cenu. Každý spoluvlastník rozhoduje o svojom podiele sám "
      + "a ostatní podielnici majú predkupné právo (§ 140 Občianskeho zákonníka). Výsledok nič nenariaďuje.",
  },
  {
    sc: "GOLD07", tab: "Veľké celky a podiely", title: "Veľké celky a podielové štruktúry", card: Card07,
    intro: "Súvislé celky od 1 ha — buď jedného okruhu spoluvlastníkov, alebo blok viacerých LV so spoločnou dominantnou osobou. Pri každom: počet "
      + "spoluvlastníkov, najväčší podiel, koľkí tvoria väčšinu a varianty: predaj celku, väčšinový podielnik, reálne rozdelenie podľa podielov "
      + "(drobenie pôdy mimo ZÚ) a parcelácia na stavebné pozemky.",
    reasons: { shares_complete: "podiely / nezistení", owner_identity: "totožnosť", site_access: "prístup", zone_housing: "ÚP",
      geometry_valid: "geometria", temporal_consistency: "dátum zdrojov" },
    textReasons: [[/podiel/, "podiely / nezistení"], [/cesty/, "prístup"]],
    stat: (ms) => [{ label: "Zhody", value: ms.length }, { label: "Plocha zhôd", value: m2(ms.reduce((t, r) => t + N(r, "areaM2"), 0)) }],
    sort: (a, b) => N(b, "score") - N(a, "score") || N(b, "areaM2") - N(a, "areaM2"),
    actions: ["výpis LV a ťarchy celku; overiť podiely a nezistených spoluvlastníkov", "overiť ÚP a regulatív (parcelácia len pri bývaní v ÚP)",
      "pri reálnom rozdelení navrhnúť diely geometrickým plánom s prístupom ku každému"],
    disclaimer: "Spoluvlastnícky podiel nie je fyzicky oddelený diel a spoluvlastník nemusí súhlasiť — o predaji celku rozhodujú všetci, väčšina podľa "
      + "podielov len o hospodárení (§ 139 OZ); reálne rozdelenie je dohoda alebo rozhodnutie súdu (§ 141–142 OZ). Varianty sú podklad na rokovanie.",
  },
  {
    sc: "GOLD29", tab: "Väzby areálov", title: "Komplexné majetkové väzby areálov", card: Card29,
    intro: "Areály s nebytovými stavbami (výroba, sklady, dvory, obchod, administratíva), kde sa krížia vlastníctva: stavby na pozemku iného vlastníka, "
      + "prístup k stavbám cez cudzí pozemok (so zapísaným vecným bremenom alebo bez neho), spoločné vnútorné cesty a budovy v ZBGIS bez zápisu v katastri.",
    reasons: { access_documented: "prístup cez cudzí pozemok", land_resolved: "pozemok bez LV", areal_access: "prístup areálu",
      geometry_valid: "geometria", temporal_consistency: "dátum zdrojov" },
    textReasons: [[/prístup/, "prístup cez cudzí pozemok"]],
    stat: (ms) => [{ label: "Zhody", value: ms.length }, { label: "Stavby na cudzom pozemku", value: ms.reduce((t, r) => t + N(r, "nForeign"), 0) }],
    sort: (a, b) => N(b, "score") - N(a, "score") || N(b, "nBuildings") - N(a, "nBuildings"),
    actions: ["výpisy LV stavieb a pozemkov areálu; vecné bremená a nájmy (zmluvy)", "vysporiadanie pozemkov pod stavbami — karta Vysporiadanie",
      "obhliadka: skutočné cesty, brány, siete a ich vlastníci"],
    disclaimer: "Väzby sú odvodené z katastra (LV stavieb a pozemkov, vecné bremená) a mapy KN; nájomné a užívacie zmluvy kataster nevedie. "
      + "Vlastníci sú uvedení typom a okruhom, nie menom. Právny stav posúdi právnik.",
  },
  {
    sc: "GOLD08", tab: "Garáže a malé pozemky", title: "Garáže a malé investičné pozemky", card: Card08,
    intro: "Malé nezastavané parcely pri ceste, kde sa zmestí obdĺžnik garáže kolmo na cestu (aj dvojgaráž či rad garáží) s manipulačným priestorom na "
      + "vlastnom pozemku. Kontroluje sa zastavané územie, ÚP, trieda cesty (rozhľady a pripojenie), ochranné pásma a dopyt — počet bytov v bytových domoch v okolí.",
    reasons: { maneuver_space: "manipulačná plocha", sight_lines: "rozhľady a pripojenie", protection_zone: "ochranné pásmo", zone_garage: "ÚP",
      road_access: "prístup", vacant: "menšia stavba", not_public_green: "zeleň", geometry_valid: "geometria" },
    textReasons: [[/ochranné pásmo/, "ochranné pásmo"], [/územný plán|regulatív/, "ÚP"]],
    stat: (ms) => [{ label: "Zhody", value: ms.length }, { label: "Garáží v rade (zhody)", value: ms.reduce((t, r) => t + N(r, "nRow"), 0) }],
    sort: (a, b) => N(b, "score") - N(a, "score") || N(b, "flatsNear") - N(a, "flatsNear"),
    actions: ["overiť regulatív ÚP (garáže a drobné stavby v ploche)", "obhliadka: vjazd, rozhľad, sklon",
      "LV a ťarchy; pri parcele obce postup prenájmu alebo predaja na obci"],
    disclaimer: "Odhad z mapy KN, pôdorysov ZBGIS a OpenStreetMap (© prispievatelia OSM) — umiestnenie garáže, rozhľady a pripojenie na cestu posúdi "
      + "stavebný úrad a správca cesty. Zoznam je shortlist (najviac určený počet na k.ú. podľa skóre).",
  },
];

function isDefault(v: ScenarioVariant, schema: ScenarioSchema | null) {
  if (!schema) return false;
  const p = variantParams(v);
  return schema.params.every((d) => p[d.key] === undefined || p[d.key] === d.default);
}

function ScenarioTab({ def }: { def: Def }) {
  const [variantId, setVariantId] = useState<number | null>(null);
  const [variant, setVariant] = useState<ScenarioVariant | null>(null);
  const [defaultV, setDefaultV] = useState<ScenarioVariant | null>(null);
  const [matchRows, setMatchRows] = useState<Row[]>([]);
  const [provRows, setProvRows] = useState<Row[] | null>(null);   // „na preskúmanie" sa načíta až na klik
  const [loading, setLoading] = useState(true);
  const [cls, setCls] = useState<"MATCH" | "PROVISIONAL">("MATCH");
  const [kuFilter, setKuFilter] = useState("");
  const [limit, setLimit] = useState(30);
  const [reason, setReason] = useState<string | null>(null);

  const effective = variantId ? variant : defaultV;
  const load = useCallback((c: "MATCH" | "PROVISIONAL") => {
    const set = c === "MATCH" ? setMatchRows : setProvRows;
    if (!effective || effective.status !== "done") { set([]); setLoading(!!effective && effective.status !== "failed"); return; }
    setLoading(true);
    getScenarioVariantRows({ data: { variantId: effective.id, classification: c } })
      .then((r) => set(JSON.parse(r.rowsJson) as Row[]))
      .catch(() => set([])).finally(() => setLoading(false));
  }, [effective?.id, effective?.status]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setProvRows(null); load("MATCH"); }, [load]);
  useEffect(() => { if (cls === "PROVISIONAL" && provRows === null) load("PROVISIONAL"); }, [cls, provRows, load]);
  const rows = useMemo(() => [...matchRows, ...(provRows ?? [])], [matchRows, provRows]);

  const katastre = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) m.set(S(r, "kodKu"), kuLabel(S(r, "_kuName") || S(r, "kuName") || null, S(r, "kodKu")));
    return Array.from(m, ([kod, name]) => ({ kod, name })).sort((a, b) => a.name.localeCompare(b.name, "sk"));
  }, [rows]);
  const vKu = useMemo(() => (kuFilter ? rows.filter((r) => S(r, "kodKu") === kuFilter) : rows), [rows, kuFilter]);
  const matches = vKu.filter((r) => S(r, "classification") === "MATCH");
  const nProv: number | string = provRows !== null ? vKu.length - matches.length : kuFilter ? "…" : (effective?.n_provisional ?? 0);
  const reasonOf = (r: Row) => reasonFromKeys(A(r, "openKeys"), A(r, "notes").join(" "), def.reasons, def.textReasons);
  const reasonCountsList = useMemo(() => (cls === "PROVISIONAL" ? reasonCounts(vKu.filter((r) => S(r, "classification") === "PROVISIONAL"), reasonOf) : []), [vKu, cls]); // eslint-disable-line react-hooks/exhaustive-deps
  const shownAll = useMemo(
    () => vKu.filter((r) => S(r, "classification") === cls && (cls !== "PROVISIONAL" || !reason || reasonOf(r) === reason)).sort(def.sort),
    [vKu, cls, reason], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const shown = shownAll.slice(0, limit);
  const btn = (on: boolean) => `px-3 py-1 ${on ? "bg-ink text-cream" : "bg-paper text-muted hover:text-fg"}`;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-fg">{def.title}</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted">{def.intro} Všetky prahy sa dajú prepnúť.</p>
      </div>

      <ScenarioSwitches
        scenario={def.sc} selected={variantId}
        onSelect={(id, v) => { setVariantId(id); setVariant(v); setLimit(30); }}
        onVariants={(vs, schema) => setDefaultV(vs.find((v) => v.status === "done" && isDefault(v, schema)) ?? vs.find((v) => isDefault(v, schema)) ?? null)}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {def.stat(matches).map((s) => <Stat key={s.label} label={s.label} value={s.value} />)}
        <Stat label="Na preskúmanie" value={nProv} />
        <Stat label={kuFilter ? "Vybrané k.ú." : "Katastre"} value={kuFilter ? 1 : katastre.length} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SectionHeader title="Nálezy" hint="Zoradené podľa skóre; vlastníci len typom, počtom a číslom LV." />
        <div className="ml-auto flex flex-wrap items-center gap-2 text-xs">
          <div className="flex overflow-hidden rounded-md border border-line">
            <button onClick={() => { setCls("MATCH"); setLimit(30); }} className={btn(cls === "MATCH")}>Zhody ({matches.length})</button>
            <button onClick={() => { setCls("PROVISIONAL"); setLimit(30); }} className={btn(cls === "PROVISIONAL")}>Na preskúmanie ({nProv})</button>
          </div>
          <select value={kuFilter} onChange={(e) => { setKuFilter(e.target.value); setLimit(30); }}
            className="rounded-md border border-line bg-paper px-2 py-1 text-fg">
            <option value="">Všetky k.ú.</option>
            {katastre.map((k) => <option key={k.kod} value={k.kod}>{k.name}</option>)}
          </select>
        </div>
      </div>

      {cls === "PROVISIONAL" ? <ReasonFilter counts={reasonCountsList} value={reason} onChange={(v) => { setReason(v); setLimit(30); }} /> : null}

      {loading ? (
        <Card className="p-6 text-center text-sm text-muted">
          {effective && effective.status !== "done" ? `Prepočet beží na Macu (${effective.progress ?? effective.status})…` : "Načítavam…"}
        </Card>
      ) : !effective ? (
        <Card className="p-6 text-center text-sm text-muted">Predvolený beh ešte nie je spočítaný — Mac ho založí pri najbližšom behu.</Card>
      ) : shown.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted">V tejto kategórii nie sú nálezy.</Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((r, i) => (
            <Card key={`${S(r, "kodKu")}-${S(r, "resultHash")}-${i}`} className="flex flex-col p-4">
              {def.card({ r })}
              <Tail r={r} actions={def.actions} />
            </Card>
          ))}
        </div>
      )}

      {shown.length < shownAll.length ? (
        <button onClick={() => setLimit((l) => l + 30)} className="mx-auto block rounded-md border border-line px-4 py-2 text-sm text-fg hover:bg-surface-2">
          Zobraziť viac ({shownAll.length - shown.length})
        </button>
      ) : null}

      <Disclaimer>{def.disclaimer}</Disclaimer>
    </div>
  );
}

function InvestPage() {
  const [tab, setTab] = useState<ScenarioKey>("GOLD13");
  useEffect(() => {
    const h = typeof window !== "undefined" ? window.location.hash.replace("#", "").toUpperCase() : "";
    const hit = DEFS.find((d) => d.sc === h);
    if (hit) setTab(hit.sc);
  }, []);
  const def = DEFS.find((d) => d.sc === tab) ?? DEFS[0];
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-fg">Investičné celky</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Päť pohľadov na skladanie a vyjednávanie pozemkov: zostavy susedných parciel, najmenej potrebných súhlasov, veľké celky
          s podielovým vlastníctvom, väzby v areáloch a malé pozemky na garáže. Z mapy KN, katastra a ZBGIS; bez mien vlastníkov.
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5 text-xs">
        {DEFS.map((d) => (
          <button key={d.sc}
            onClick={() => { setTab(d.sc); if (typeof window !== "undefined") window.history.replaceState(null, "", `#${d.sc.toLowerCase()}`); }}
            className={`rounded-full border px-3 py-1 ${tab === d.sc ? "border-ink bg-ink text-cream" : "border-line text-fg hover:bg-surface-2"}`}>
            {d.tab}
          </button>
        ))}
      </div>
      <ScenarioTab key={def.sc} def={def} />
    </div>
  );
}
