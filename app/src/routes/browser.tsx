import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { getDatasets, getLvRegistry, getLvDetail } from "../lib/api/kataster.functions";
import { ownerAccess, type Dataset, type Lv, type LvOwner } from "../lib/domain";
import { Badge, Card, Disclaimer, Icon, SectionHeader } from "../components/kit";
import { useRole } from "../lib/role-context";

export const Route = createFileRoute("/browser")({
  head: () => ({ meta: [{ title: "Kataster Browser — TRI LIPY KATASTER CORE" }] }),
  loader: async () => {
    const datasets = await getDatasets();
    const first = datasets.find((d) => d.status !== "blocked") ?? datasets[0];
    const reg = first
      ? await getLvRegistry({ data: { datasetId: first.id, role: "viewer" } })
      : null;
    return { datasets, firstId: first?.id ?? null, initialLvs: reg?.lvs ?? [], total: reg?.total ?? 0 };
  },
  component: BrowserPage,
});

type Detail = {
  access: "full" | "summary" | "denied";
  count: number;
  companyCount: number;
  personCount: number;
  owners: LvOwner[];
};

function BrowserPage() {
  const { datasets, firstId, initialLvs, total } = Route.useLoaderData();
  const { role } = useRole();
  const access = ownerAccess(role);

  const [datasetId, setDatasetId] = useState<string | null>(firstId);
  const [query, setQuery] = useState("");
  const [lvs, setLvs] = useState<Lv[]>(initialLvs);
  const [count, setCount] = useState(total);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);

  const loadRegistry = useCallback(
    async (dsId: string, q: string) => {
      setLoading(true);
      setSelected(null);
      setDetail(null);
      try {
        const r = await getLvRegistry({ data: { datasetId: dsId, role, q: q || undefined } });
        setLvs(r.lvs);
        setCount(r.total);
      } finally {
        setLoading(false);
      }
    },
    [role],
  );

  // Pri zmene roly znova načítať (mení sa name-search access).
  useEffect(() => {
    if (datasetId) void loadRegistry(datasetId, query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  async function openLv(lvNo: number) {
    if (!datasetId) return;
    setSelected(lvNo);
    setDetail(null);
    const r = await getLvDetail({ data: { datasetId, lvNo, role } });
    setDetail(r as Detail);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-fg">Kataster Browser</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Reálne listy vlastníctva a vlastníci z SPI — tabuľkovo, mimo mapy. Owner-sensitive obsah je
          maskovaný podľa role priamo na serveri.
        </p>
      </div>

      {/* Ovládanie */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex items-center gap-2">
          <span className="text-xs text-muted">Dataset</span>
          <select
            value={datasetId ?? ""}
            onChange={(e) => {
              setDatasetId(e.target.value);
              setQuery("");
              void loadRegistry(e.target.value, "");
            }}
            className="rounded-md border border-line bg-paper px-3 py-1.5 text-sm text-fg outline-none focus:border-brand"
          >
            {datasets.map((d: Dataset) => (
              <option key={d.id} value={d.id}>{d.ku_name} · {d.kn_type}</option>
            ))}
          </select>
        </label>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => { e.preventDefault(); if (datasetId) void loadRegistry(datasetId, query); }}
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={access === "full" ? "Číslo LV alebo meno vlastníka…" : "Číslo LV…"}
            className="w-64 rounded-md border border-line bg-paper px-3 py-1.5 text-sm text-fg outline-none focus:border-brand"
          />
          <button className="rounded-md border border-line px-3 py-1.5 text-sm text-fg hover:bg-surface-2">
            Hľadať
          </button>
        </form>
        <div className="ml-auto text-xs text-muted">{count} LV v datasete</div>
      </div>

      {/* Rolová informácia */}
      <div
        className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs"
        style={{ borderColor: "#33333355", background: "#33333312", color: "#8a8a8a" }}
      >
        <Icon name="shield" size={14} />
        {access === "full" && <span>Rola <b className="text-fg">{role}</b> vidí mená vlastníkov a podiely. Vyhľadávanie podľa mena je aktívne.</span>}
        {access === "summary" && <span>Rola <b className="text-fg">{role}</b> je <b>summary-only</b> — vidí počty vlastníkov, nie mená. Server mená nevracia.</span>}
        {access === "denied" && <span>Rola <b className="text-fg">{role}</b> nemá prístup k owner-sensitive detailu. Zobrazujú sa iba čísla LV a počty.</span>}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        {/* Zoznam LV */}
        <div>
          <SectionHeader title="Listy vlastníctva" hint={loading ? "načítavam…" : `${lvs.length} zobrazených`} />
          <Card className="max-h-[62vh] overflow-y-auto divide-y divide-line">
            {lvs.length === 0 ? (
              <div className="p-4 text-sm text-muted">Žiadne LV pre daný filter.</div>
            ) : (
              lvs.map((l) => (
                <button
                  key={l.lv_no}
                  onClick={() => openLv(l.lv_no)}
                  className={"flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-2 " + (selected === l.lv_no ? "bg-surface-2" : "")}
                  style={selected === l.lv_no ? { boxShadow: "inset 2px 0 0 #333333" } : undefined}
                >
                  <span className="text-sm font-medium text-fg">LV {l.lv_no}</span>
                  <span className="text-xs text-muted">{l.co_owners} {l.co_owners === 1 ? "vlastník" : l.co_owners < 5 ? "vlastníci" : "vlastníkov"}</span>
                </button>
              ))
            )}
          </Card>
        </div>

        {/* Detail LV */}
        <div>
          <SectionHeader title={selected ? `LV ${selected}` : "Detail LV"} hint="Vlastníci a podiely" />
          <Card className="p-4">
            {selected == null ? (
              <div className="text-sm text-muted">Vyber list vlastníctva vľavo.</div>
            ) : detail == null ? (
              <div className="text-sm text-muted">Načítavam…</div>
            ) : (
              <div>
                <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
                  <Badge color="#5b7a58">{detail.count} vlastníkov</Badge>
                  {detail.companyCount > 0 ? <Badge color="#6b6f86">{detail.companyCount} PO/firma</Badge> : null}
                  {detail.personCount > 0 ? <Badge color="#8a8a8a">{detail.personCount} FO</Badge> : null}
                  {datasetId ? (
                    <span className="ml-auto flex items-center gap-1.5">
                      <Link
                        to="/vypis/$datasetId/$lvNo"
                        params={{ datasetId, lvNo: String(selected) }}
                        search={{ typ: "vypis" }}
                        className="rounded-md bg-ink px-2.5 py-1 text-xs font-medium text-cream"
                      >
                        Výpis LV
                      </Link>
                      <Link
                        to="/vypis/$datasetId/$lvNo"
                        params={{ datasetId, lvNo: String(selected) }}
                        search={{ typ: "el" }}
                        className="rounded-md border border-line px-2.5 py-1 text-xs font-medium text-fg hover:border-ink"
                      >
                        Evidenčný list
                      </Link>
                    </span>
                  ) : null}
                </div>
                {detail.access === "full" ? (
                  detail.owners.length ? (
                    <ul className="divide-y divide-line">
                      {detail.owners.map((o) => (
                        <li key={o.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                          <span className="flex items-center gap-2 text-fg">
                            {o.is_company ? <Icon name="database" size={13} className="text-brand" /> : null}
                            {o.name}
                          </span>
                          <span className="tabular-nums text-muted">{o.share || "—"}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-sm text-muted">Bez záznamov.</div>
                  )
                ) : detail.access === "summary" ? (
                  <div className="rounded-lg border border-line bg-surface-2/50 p-3 text-sm text-muted">
                    Summary-only režim: <b className="text-fg">{detail.count}</b> vlastníkov ({detail.personCount} FO,
                    {" "}{detail.companyCount} PO). Mená a podiely server pre túto rolu nevracia.
                  </div>
                ) : (
                  <div className="rounded-lg border border-line bg-surface-2/50 p-3 text-sm text-muted">
                    Owner-sensitive detail je pre rolu <b className="text-fg">{role}</b> odmietnutý. K dispozícii je len
                    počet vlastníkov: <b className="text-fg">{detail.count}</b>.
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>

      <Disclaimer>
        Dáta pochádzajú z reálneho SPI importu (ROEP). Ide o interný pracovný pohľad, nie o úradný výpis z LV.
        Vlastnícke mená sú owner-sensitive; maskovanie sa vynucuje na serveri, nie iba v UI. Ukladajú sa len
        meno, podiel a číslo LV — nie adresy ani rodné čísla.
      </Disclaimer>
    </div>
  );
}
