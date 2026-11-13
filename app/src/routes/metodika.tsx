import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";

// VEREJNÁ METODIKA listu nehnuteľnosti (2026-11-13, porovnanie s parcelnik.sk): ako vzniká semafor a čo
// znamenajú stavy. Bez prihlásenia (pridané do verejných ciest v __root.tsx Gate), bez dát z appky —
// len text. Pravidlá zodpovedajú src/lib/property-eval.ts `semafor()`; pri zmene pravidiel upraviť aj tu.
export const Route = createFileRoute("/metodika")({
  head: () => ({ meta: [
    { title: "Metodika listu nehnuteľnosti — TRI LIPY" },
    { name: "description", content: "Ako list nehnuteľnosti TRI LIPY hodnotí právny stav, prístup, limity, územný plán, siete a cenu." },
  ] }),
  component: MetodikaPage,
});

type State = "ok" | "warn" | "bad" | "unknown";
const STATE: Record<State, { label: string; color: string; text: string }> = {
  ok: { label: "V poriadku", color: "#5b7a58", text: "V sledovaných zdrojoch sme nenašli problém. Neznamená to záruku — zdroje majú svoje obmedzenia (nižšie)." },
  warn: { label: "Pozor", color: "#b07d2b", text: "Našli sme okolnosť, ktorú treba pred rozhodnutím preveriť, ale nemusí brániť kúpe ani výstavbe." },
  bad: { label: "Riziko", color: "#9c4a40", text: "Našli sme okolnosť, ktorá môže kúpu, financovanie alebo výstavbu zásadne obmedziť." },
  unknown: { label: "Neoverené", color: "#8a8a8a", text: "Zdroj chýbal alebo neodpovedal. „Neoverené“ nie je „v poriadku“ — vec treba overiť inak." },
};

const RULES: { area: string; rows: [State, string][]; note?: string }[] = [
  { area: "Právny stav (list vlastníctva, časti B a C)", rows: [
    ["bad", "exekúcia, konkurz, dražba, súdne konanie, spochybnený zápis alebo zákaz nakladania"],
    ["warn", "zapísaná ťarcha alebo poznámka (napr. záložné právo, vecné bremeno), alebo vecné bremeno zakreslené v katastrálnej mape cez parcelu"],
    ["ok", "v našom zázname bez tiarch a bez problémov"],
    ["unknown", "časť B alebo C pre niektorý list vlastníctva nemáme"],
  ], note: "Vždy rozhoduje aktuálny úradný výpis z listu vlastníctva — náš záznam je k dátumu importu katastra." },
  { area: "Prístup z cesty", rows: [
    ["ok", "parcela podľa katastrálnej mapy hraničí s parcelou cesty vo verejnom vlastníctve"],
    ["warn", "k parcele sa ide cez iný (súkromný) pozemok — bez zapísaného vecného bremena môže vlastník prechod zakázať"],
    ["bad", "parcela nehraničí so žiadnou cestou — treba vecné bremeno alebo kúpu prístupu"],
    ["unknown", "geometria parcely chýba, prístup sa nedal určiť"],
  ], note: "Cesta v mape nie je dôkaz práva prechodu ani povolenia vjazdu; napojenie potvrdí obec alebo správca cesty." },
  { area: "Limity a riziká (úradné registre)", rows: [
    ["bad", "záplavové územie (Q5 až Q1000), vysoká náchylnosť na svahové pohyby alebo zosuv, dobývací priestor, chránené ložiskové územie, environmentálna záťaž alebo skládka, vysoké radónové riziko"],
    ["warn", "iný zásah: pamiatková rezervácia, pamiatková zóna, ochranné pásmo pamiatky, UNESCO (treba záväzné stanovisko krajského pamiatkového úradu), ochranné pásmo vodného zdroja, chránená vodohospodárska oblasť, Natura 2000, maloplošné chránené územie, SEVESO, hydromeliorácie, zraniteľná oblasť a pod."],
    ["ok", "v sledovaných registroch bez zásahu"],
    ["unknown", "registre neodpovedali"],
  ], note: "Registre sa pýtame na bod v strede parcely (pri niektorých s okolím ± 50 m). Pri veľkej alebo pretiahnutej parcele môže zásah do jej časti uniknúť. Nadregionálny ÚSES uvádzame len ako informáciu — záväzný miestny ÚSES je v územnom pláne obce." },
  { area: "Územný plán", rows: [
    ["ok", "funkčná plocha na bývanie, zmiešaná, rekreácia alebo občianska vybavenosť"],
    ["warn", "poľnohospodárska, lesná plocha, zeleň alebo voda — výstavba len po zmene územného plánu; iná funkcia — overiť regulatív"],
    ["unknown", "zónu pre parcelu nemáme (obec územný plán nezverejňuje alebo nemá výkres)"],
  ], note: "Zónu odčítavame z mapových služieb obcí alebo z georeferencovaných výkresov (presnosť niekoľko metrov). Záväzná je územnoplánovacia informácia od obce — vzor žiadosti je v appke." },
  { area: "Siete", rows: [
    ["ok", "obec má verejný vodovod aj kanalizáciu pre aspoň polovicu domov"],
    ["warn", "vodovod alebo kanalizácia v obci chýba či pokrýva menej ako polovicu domov; najbližšia trafostanica ďalej ako 500 m, keď o vodovode nič nevieme"],
    ["unknown", "údaje o sieťach nemáme"],
  ], note: "Polohy vedení sú z OpenStreetMap (± 5–10 m). Presné trasy, ochranné pásma a voľnú kapacitu potvrdí len vyjadrenie správcu siete." },
  { area: "Cena", rows: [
    ["warn", "ponuková cena je o viac ako 25 % vyššia ako odhad z porovnateľných predajov"],
    ["ok", "ponuka v rozpätí odhadu, alebo máme len odhad"],
    ["unknown", "na odhad chýbajú porovnateľné predaje"],
  ], note: "Odhad vychádza z cien zo zmlúv zapísaných v katastri a z ponúk v okrese. Nie je to znalecký posudok." },
];

function Dot({ s }: { s: State }) {
  return <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: STATE[s].color }} aria-hidden />;
}
function H({ children }: { children: ReactNode }) {
  return <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-fg">{children}</h2>;
}

function MetodikaPage() {
  return (
    <main className="min-h-dvh bg-cream px-4 py-10 text-fg">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center gap-3">
          <img src="/tl-tree.png" alt="" className="h-10 w-auto" aria-hidden />
          <div>
            <div className="font-display text-sm font-semibold uppercase tracking-[0.28em]">TRI LIPY</div>
            <div className="text-[10px] uppercase tracking-[0.28em] text-muted">List nehnuteľnosti · metodika</div>
          </div>
        </div>
        <h1 className="mt-8 text-balance text-2xl font-semibold tracking-tight">Ako hodnotíme nehnuteľnosť</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          List nehnuteľnosti skladá údaje z katastra, úradných registrov, mapových služieb, obcí a trhu. Na začiatku listu je
          semafor so šiestimi oblasťami. Každá oblasť má jeden zo štyroch stavov a pravidlá nižšie presne zodpovedajú tomu,
          ako ich list počíta. Pri každej kapitole listu je uvedený zdroj a dátum, ku ktorému údaj platí.
        </p>

        <H>Štyri stavy</H>
        <ul className="mt-3 space-y-2">
          {(Object.keys(STATE) as State[]).map((s) => (
            <li key={s} className="flex gap-3 text-sm leading-relaxed"><span className="mt-1.5"><Dot s={s} /></span><span><b>{STATE[s].label}.</b> {STATE[s].text}</span></li>
          ))}
        </ul>

        <H>Pravidlá podľa oblastí</H>
        <div className="mt-3 space-y-4">
          {RULES.map((r) => (
            <section key={r.area} className="rounded-xl border border-line bg-surface p-4">
              <h3 className="text-sm font-semibold">{r.area}</h3>
              <ul className="mt-2 space-y-1.5">
                {r.rows.map(([s, t], i) => (
                  <li key={i} className="flex gap-2.5 text-sm leading-relaxed"><span className="mt-1.5"><Dot s={s} /></span><span><span className="font-medium">{STATE[s].label}:</span> {t}</span></li>
                ))}
              </ul>
              {r.note ? <p className="mt-2 text-xs leading-relaxed text-muted">{r.note}</p> : null}
            </section>
          ))}
        </div>

        <H>Čo list nie je</H>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-relaxed text-muted">
          <li>Nie je to znalecký posudok, právne stanovisko ani geodetický záver.</li>
          <li>Nenahrádza úradný výpis z listu vlastníctva ani vyjadrenia správcov sietí a stavebného úradu.</li>
          <li>Výmera z mapy je informatívna; záväzná je výmera v katastri.</li>
          <li>V klientskej verzii sa mená vlastníkov — fyzických osôb — neuvádzajú.</li>
        </ul>

        <H>Zdroje</H>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Kataster (ÚGKK SR: súbor popisných a geodetických informácií, ZBGIS, ESKN), registre ŠGÚDŠ, SVP, SAŽP, ŠOP SR,
          NLC, VÚPOP, SHMÚ, Pamiatkového úradu SR a ďalších inštitúcií, údaje obcí (VZN, územné plány), OpenStreetMap a
          verejná realitná inzercia. Pri každom údaji v liste je uvedený jeho poskytovateľ.
        </p>
        <p className="mt-10 text-xs text-muted">Stav metodiky: 13. 11. 2026 · TRI LIPY</p>
      </div>
    </main>
  );
}
