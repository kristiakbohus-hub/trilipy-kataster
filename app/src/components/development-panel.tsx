import { proxyZone, regulativByCode, regulativFromZone, developmentCalc, addMonths, DEV_DEFAULTS, type DevOpts, type ZoneLike } from "../lib/development";

const eur = (n: number) => n.toLocaleString("sk-SK", { maximumFractionDigits: 0 });
const eurM = (n: number) => (n / 1_000_000).toLocaleString("sk-SK", { maximumFractionDigits: 2 }) + " M €";

// Development potenciál pre jednu parcelu — ÚP rekapitulácia + kalkulačka + skóre.
// zoneCode = priradená ÚP zóna (ak je); inak proxy z druhu/umiestnenia (orientačné).
export function DevelopmentPanel({
  areaM2, useType, placement, zone, opts = DEV_DEFAULTS,
}: {
  areaM2: number; useType: string | null | undefined; placement: string | null | undefined;
  zone?: ZoneLike | null; opts?: DevOpts;
}) {
  const fromZone = regulativFromZone(zone);
  const reg = fromZone ?? regulativByCode(proxyZone(useType, placement));
  if (!reg) return <div className="text-xs text-muted">ÚP zónu sa nepodarilo určiť.</div>;
  const d = developmentCalc(areaM2, reg, opts);
  const proxied = !fromZone;

  const Line = ({ k, v, strong }: { k: string; v: string; strong?: boolean }) => (
    <div className="flex justify-between gap-2 py-0.5">
      <span className="text-muted">{k}</span>
      <span className={strong ? "font-semibold text-fg" : "text-fg"}>{v}</span>
    </div>
  );

  return (
    <div className="space-y-2 text-xs">
      {proxied ? (
        <div className="rounded border border-line px-2 py-1 text-[10px] text-muted" style={{ background: "#f5efe0" }}>
          Zóna odvodená z druhu pozemku (proxy) — nie z formálneho ÚP. Po nahraní/priradení ÚP zóny sa spresní.
        </div>
      ) : null}

      {/* Rekapitulácia ÚP */}
      <div className="rounded-md border border-line bg-surface-2/30 p-2">
        <div className="mb-1 flex items-center justify-between">
          <span className="font-semibold text-fg">Rekapitulácia ÚP</span>
          <span className="rounded px-1.5 py-0.5 text-[10px]" style={{ background: "#c9a45c33", color: "#8a6d2f" }}>{reg.code}</span>
        </div>
        <Line k="Funkčná plocha" v={reg.name} />
        <Line k="Charakter územia" v={reg.character === "rozvojove" ? "rozvojové" : reg.character === "stabilizovane" ? "stabilizované" : "nezastavateľné"} />
        <Line k="IPP (index podl. plôch)" v={String(reg.ipp)} />
        {d.buildable ? (
          <>
            <Line k="HPP max." v={`${eur(d.hpp)} m²`} strong />
            <Line k={`ČPP (${reg.cppCoef})`} v={`${eur(d.cpp)} m²`} strong />
            <Line k="Zastavateľnosť (IZP max.)" v={`${eur(d.izpArea)} m² (${reg.izp})`} />
            <Line k="Zeleň (KZ min.)" v={`${eur(d.kzArea)} m² (${reg.kz})`} />
          </>
        ) : (
          <div className="mt-1 text-[11px]" style={{ color: "#9c4a40" }}>Nezastavateľné podľa ÚP — bez stavebného potenciálu.</div>
        )}
      </div>

      {d.buildable ? (
        <>
          {/* Parkovanie STN 73 6110 */}
          <div className="rounded-md border border-line bg-surface-2/30 p-2">
            <div className="mb-1 font-semibold text-fg">Parkovanie (STN 73 6110)</div>
            <Line k="Odhad bytových jednotiek" v={`${d.byty} bj`} strong />
            <Line k="Stánia vázané" v={`${d.parking.vazane} PM`} />
            <Line k="Stánia návštevnícke (20 %)" v={`${d.parking.navstevnicke} PM`} />
            <Line k="Celkom stánia" v={`${d.parking.spolu} PM`} strong />
            <div className="mt-1 text-[10px] text-muted">Cyklo {d.parking.cyklo} · moto {d.parking.moto} · imobilní {d.parking.imobil}. Presné Ka určí stavebný úrad.</div>
          </div>

          {/* Ekonomika */}
          <div className="rounded-md border border-line bg-surface-2/30 p-2">
            <div className="mb-1 font-semibold text-fg">Ekonomika projektu (orientačná)</div>
            <Line k="Celkom náklady" v={eurM(d.ekonomika.naklady)} />
            <Line k="GDV (predaj)" v={eurM(d.ekonomika.gdv)} strong />
            <Line k="Hrubá marža" v={`${d.ekonomika.marzaPct} %`} strong />
            <div className="mt-1 text-[10px] text-muted">Predaj {eur(opts.predajEurM2)} €/m² · náklady {eur(opts.nakladyEurM2Hpp)} €/m² HPP. Neskôr z reálnych cien inzercie.</div>
          </div>

          {/* Harmonogram */}
          <div className="rounded-md border border-line bg-surface-2/30 p-2">
            <div className="mb-1 font-semibold text-fg">Harmonogram</div>
            <Line k="Vydanie IP (odhad)" v={addMonths(d.harmonogram.ipMonths)} />
            <Line k="1. odovzdanie bytov" v={addMonths(d.harmonogram.totalMonths)} />
            <Line k="Dĺžka projektu" v={`${d.harmonogram.totalMonths} mes.`} strong />
          </div>
        </>
      ) : null}

      {/* Development skóre */}
      <div className="rounded-md border border-line p-2">
        <div className="mb-1 flex items-center justify-between">
          <span className="font-semibold text-fg">Development skóre</span>
          <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: d.score >= 60 ? "#5b7a5822" : d.score >= 30 ? "#c9a45c22" : "#9c4a4022", color: d.score >= 60 ? "#3f5a3c" : d.score >= 30 ? "#8a6d2f" : "#9c4a40" }}>{d.score}/100</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {d.reasons.map((r, i) => <span key={`r${i}`} className="rounded px-1.5 py-0.5 text-[10px]" style={{ background: "#5b7a5818", color: "#3f5a3c" }}>✓ {r}</span>)}
          {d.risks.map((r, i) => <span key={`x${i}`} className="rounded px-1.5 py-0.5 text-[10px]" style={{ background: "#9c4a4018", color: "#9c4a40" }}>⚠ {r}</span>)}
        </div>
      </div>

      {/* Interpretácia zóny */}
      <div className="rounded-md border border-line bg-surface-2/30 p-2">
        <div className="mb-1 font-semibold text-fg">Interpretácia zóny — {reg.kategoria}</div>
        <div className="mb-1"><span className="text-[10px] font-semibold" style={{ color: "#3f5a3c" }}>✅ PRÍPUSTNÉ</span><div className="text-muted">{reg.pripustne}</div></div>
        <div className="mb-1"><span className="text-[10px] font-semibold" style={{ color: "#8a6d2f" }}>⚠ PODMIENEČNE</span><div className="text-muted">{reg.podmienecne}</div></div>
        <div><span className="text-[10px] font-semibold" style={{ color: "#9c4a40" }}>✖ NEPRÍPUSTNÉ</span><div className="text-muted">{reg.nepripustne}</div></div>
      </div>

      <div className="text-[10px] text-muted">Skóre a hodnoty sú orientačné; presné určuje stavebný úrad a platný ÚP. Nezohľadňuje aktuálny stav zástavby.</div>
    </div>
  );
}
