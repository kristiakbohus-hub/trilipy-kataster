import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { getBpejCennik } from "../lib/api/kataster.functions";
import { LEGAL, LEGAL_CATEGORIES, citeLabel, type LegalEntry } from "../lib/legal";
import { Card, Disclaimer, SectionHeader, Badge } from "../components/kit";

export const Route = createFileRoute("/pravny-referent")({
  head: () => ({ meta: [{ title: "Právny referent — TRI LIPY KATASTER CORE" }] }),
  loader: async () => ({ cennik: await getBpejCennik().catch(() => []) }),
  component: PravnyReferentPage,
});

function eur(n: number): string {
  return n.toLocaleString("sk-SK", { maximumFractionDigits: 3 });
}

function PravnyReferentPage() {
  const { cennik } = Route.useLoaderData();
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return LEGAL;
    return LEGAL.filter(
      (e) =>
        e.term.toLowerCase().includes(s) ||
        e.summary.toLowerCase().includes(s) ||
        e.refs.some((r) => r.law.toLowerCase().includes(s) || (r.par ?? "").toLowerCase().includes(s)),
    );
  }, [q]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <SectionHeader
        title="Právny referent"
        hint="Kurátorovaná referencia k slovenskému katastru — pojmy, predpisy a paragrafy."
      />

      <Disclaimer>
        Interný informatívny podklad, <strong>nie právne poradenstvo</strong> ani úradný výklad. Znenie
        a čísla paragrafov overte v aktuálnom znení predpisov (Slov-Lex). Slovenské právne predpisy nie
        sú predmetom autorskoprávnej ochrany.
      </Disclaimer>

      <div className="my-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Hľadať pojem, predpis alebo paragraf (napr. plomba, 162/1995, § 28)…"
          className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-green"
        />
      </div>

      {LEGAL_CATEGORIES.map((cat) => {
        const items = filtered.filter((e) => e.category === cat);
        if (items.length === 0) return null;
        return (
          <section key={cat} className="mb-6">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">{cat}</h2>
            <div className="space-y-2">
              {items.map((e) => (
                <LegalCard key={e.id} entry={e} />
              ))}
            </div>
          </section>
        );
      })}

      {filtered.length === 0 ? (
        <p className="text-sm text-muted">Žiadny pojem nezodpovedá hľadaniu „{q}".</p>
      ) : null}

      {/* Cenník odvodov za odňatie (živý z databázy — NV 58/2013) */}
      <section className="mb-6" id="cennik-odnatia">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          Cenník odvodov za odňatie pôdy (NV 58/2013 Z.z.)
        </h2>
        <Card>
          {cennik.length === 0 ? (
            <p className="text-sm text-muted">Cenník sa načíta po nasadení migrácie.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase text-muted">
                  <th className="py-1.5 pr-2">Skupina</th>
                  <th className="py-1.5 pr-2">Kvalita</th>
                  <th className="py-1.5 pr-2 text-right">Trvalé €/m²</th>
                  <th className="py-1.5 text-right">Dočasné €/m²/rok</th>
                </tr>
              </thead>
              <tbody>
                {cennik.map((r) => (
                  <tr key={r.skupina} className="border-b border-line/50">
                    <td className="py-1.5 pr-2 font-medium">{r.skupina}</td>
                    <td className="py-1.5 pr-2 text-muted">{r.popis ?? "—"}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{eur(r.eur_m2)}</td>
                    <td className="py-1.5 text-right tabular-nums text-muted">
                      {r.eur_m2_docasne != null ? eur(r.eur_m2_docasne) : eur(r.eur_m2 / 100)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-2 text-xs text-muted">
            Dočasné odňatie sa platí jednorazovo za každý aj začatý rok (§ 3 ods. 3). Zaradenie kódu BPEJ do
            skupiny: Príloha č. 3 zákona 220/2004 Z.z. (7 138 kódov v systéme).
          </p>
        </Card>
      </section>
    </div>
  );
}

function LegalCard({ entry }: { entry: LegalEntry }) {
  return (
    <Card>
      <div id={entry.id} style={{ scrollMarginTop: 80 }}>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-fg">{entry.term}</h3>
          {entry.refs.map((r, i) => (
            <Badge key={i} color="#5b7a58">{citeLabel(r)}</Badge>
          ))}
        </div>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">{entry.summary}</p>
      </div>
    </Card>
  );
}
