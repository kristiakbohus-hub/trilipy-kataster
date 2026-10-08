import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { getChangeFeed, type ChangeFeedRow } from "../lib/api/kataster.functions";
import { Card, Disclaimer, SectionHeader, Stat } from "../components/kit";
import { kuLabel, parcelLabel, plural } from "../lib/domain";

// BEZ `loader` — beží počas SSR pred prihlasovacou bránou (viď pamäť cf_app_ssr_loader_leak).
export const Route = createFileRoute("/zmeny")({
  head: () => ({ meta: [{ title: "Čo sa zmenilo — TRI LIPY KATASTER CORE" }] }),
  component: ZmenyPage,
});

const SRC_LABEL: Record<string, string> = { up: "územný plán", kataster: "kataster" };
const CHANGE_LABEL: Record<string, string> = {
  new: "nové", added: "pridané", changed: "zmenené", removed: "odstránené",
};
const CHANGE_COLOR: Record<string, string> = {
  new: "#5b7a58", added: "#5b7a58", changed: "#9a7b3e", removed: "#9c4a40",
};
const DAYS = [7, 30, 90, 365];

function ZmenyPage() {
  const [rows, setRows] = useState<ChangeFeedRow[]>([]);
  const [days, setDays] = useState(30);
  const [src, setSrc] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getChangeFeed({ data: { days, src: src || undefined } })
      .then(setRows).catch(() => setRows([])).finally(() => setLoading(false));
  }, [days, src]);

  const nUp = rows.filter((r) => r.src === "up").length;
  const nKn = rows.filter((r) => r.src === "kataster").length;
  const nHigh = rows.filter((r) => r.importance === "high").length;
  const katastre = useMemo(
    () => new Set(rows.map((r) => r.ku_name ?? r.dataset_id ?? "?")).size, [rows]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-fg">Čo sa zmenilo</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Zmeny zachytené monitorom naprieč všetkými k.ú. — zverejnené dokumenty územného plánu a
          zmeny v evidencii. <b>Prázdny zoznam neznamená, že sa nič nezmenilo</b> — znamená, že
          monitor za dané obdobie nič nezaznamenal.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Územný plán" value={nUp} />
        <Stat label="Kataster" value={nKn} />
        <Stat label="Dôležité" value={nHigh} />
        <Stat label="Katastre" value={katastre} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SectionHeader title="Záznamy" hint="najnovšie prvé" />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-md border border-line text-xs">
            {DAYS.map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-3 py-1 ${days === d ? "bg-ink text-cream" : "bg-paper text-muted hover:text-fg"}`}
              >{d === 365 ? "rok" : `${d} dní`}</button>
            ))}
          </div>
          <div className="inline-flex overflow-hidden rounded-md border border-line text-xs">
            {[["", "všetko"], ["up", "územný plán"], ["kataster", "kataster"]].map(([v, l]) => (
              <button
                key={v}
                onClick={() => setSrc(v)}
                className={`px-3 py-1 ${src === v ? "bg-ink text-cream" : "bg-paper text-muted hover:text-fg"}`}
              >{l}</button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <Card className="p-6 text-center text-sm text-muted">Načítavam…</Card>
      ) : rows.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted">
          Za zvolené obdobie monitor nezaznamenal žiadnu zmenu. ÚP monitor beží pri importe a cez
          denný cron; katastrálne zmeny plní Mac cez <code>/api/ingest-changes</code>.
        </Card>
      ) : (
        <Card className="divide-y divide-line">
          {rows.map((r, i) => {
            const col = CHANGE_COLOR[r.change ?? ""] ?? "#8a8a8a";
            return (
              <div key={i} className="flex flex-wrap items-start gap-3 p-3">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: col }} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-line bg-surface-2/40 px-2 py-0.5 text-[11px] text-fg">
                      {SRC_LABEL[r.src] ?? r.src}
                    </span>
                    <span className="text-[11px]" style={{ color: col }}>
                      {CHANGE_LABEL[r.change ?? ""] ?? r.change ?? "—"}
                    </span>
                    {r.importance === "high" ? (
                      <span className="rounded-full border px-2 py-0.5 text-[11px]"
                        style={{ color: "#9c4a40", borderColor: "#9c4a4055" }}>dôležité</span>
                    ) : null}
                    <span className="text-xs text-muted">{kuLabel(r.ku_name, r.dataset_id)}</span>
                  </div>
                  <div className="mt-0.5 break-words text-sm text-fg">
                    {r.url ? (
                      <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">
                        {r.label ?? "dokument"}
                      </a>
                    ) : (r.label ?? "—")}
                  </div>
                  {r.old_value || r.new_value ? (
                    <div className="mt-0.5 text-xs text-muted">
                      {r.old_value ? <span className="line-through">{r.old_value}</span> : null}
                      {r.old_value && r.new_value ? " → " : null}
                      {r.new_value ? <b className="text-fg">{r.new_value}</b> : null}
                    </div>
                  ) : null}
                  {r.lv_no != null || r.parcel_no ? (
                    <div className="mt-0.5 text-[11px] text-muted">
                      {r.lv_no != null ? `LV ${r.lv_no}` : ""}
                      {r.lv_no != null && r.parcel_no ? " · " : ""}
                      {r.parcel_no ? `parcela ${parcelLabel(r.parcel_no)}` : ""}
                      {r.dataset_id && r.parcel_no ? (
                        <>
                          {" · "}
                          <Link to="/report/$datasetId/$parcelNo"
                            params={{ datasetId: r.dataset_id, parcelNo: r.parcel_no }}
                            className="text-brand hover:underline">dossier →</Link>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <span className="shrink-0 text-[11px] tabular-nums text-muted">{r.detected_at ?? "—"}</span>
              </div>
            );
          })}
        </Card>
      )}

      {rows.length ? (
        <p className="text-xs text-muted">
          Zobrazených {plural(rows.length, "záznam", "záznamy", "záznamov")} (strop 300 na dopyt).
        </p>
      ) : null}

      <Disclaimer>
        Monitor sleduje, čo obce zverejňujú, a zmeny v našom spracovaní — nie je to úradné
        oznámenie. Zmena dokumentu na obecnom webe nemusí znamenať zmenu právneho stavu a naopak.
      </Disclaimer>
    </div>
  );
}
