// Limity výstavby na parcele — signály z úradných registrov (ŠGÚDŠ, NLC …).
type LimitHit = { category: string; key: string; label: string; hit: boolean; count: number; buffer: number; attribution: string; error: boolean };
type LimitsResult = { items: LimitHit[]; cached?: boolean; ageDays?: number };

const CAT_ICON: Record<string, string> = {
  "Geohazardy": "⛰️", "Les a pôda": "🌲", "Vodné toky": "💧", "Chránené územia": "🛡️", "Pamiatky": "🏛️", "Infraštruktúra": "🚧",
};

function StatusBadge({ h }: { h: LimitHit }) {
  if (h.error) return <span className="rounded px-1.5 py-0.5 text-[10px]" style={{ background: "#8883", color: "#888" }}>nedostupné</span>;
  if (h.hit) return <span className="rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ background: "#9c4a4022", color: "#9c4a40" }}>zasiahnuté{h.count > 1 ? ` · ${h.count}×` : ""}</span>;
  return <span className="rounded px-1.5 py-0.5 text-[10px]" style={{ background: "#5b7a5822", color: "#3f5a3c" }}>bez limitu</span>;
}

export function LimitsPanel({ data }: { data: LimitsResult }) {
  const cats = [...new Set(data.items.map((i) => i.category))];
  const hits = data.items.filter((i) => i.hit).length;
  const errs = data.items.filter((i) => i.error).length;
  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-fg">Limity výstavby</span>
        <span className="text-[10px] text-muted">
          {hits > 0 ? <span style={{ color: "#9c4a40" }}>{hits} zásah{hits === 1 ? "" : hits < 5 ? "y" : "ov"}</span> : <span style={{ color: "#3f5a3c" }}>žiadny zásah</span>}
          {data.cached ? " · z cache" : ""}
        </span>
      </div>
      {cats.map((cat) => (
        <div key={cat}>
          <div className="mb-0.5 flex items-center gap-1 text-[11px] font-medium text-muted">
            <span>{CAT_ICON[cat] ?? "•"}</span>{cat}
          </div>
          {data.items.filter((i) => i.category === cat).map((h) => (
            <div key={h.key} className="flex items-center justify-between gap-2 border-b border-line/40 py-1">
              <span className="min-w-0 truncate text-muted">{h.label}</span>
              <span className="flex items-center gap-1 whitespace-nowrap">
                <StatusBadge h={h} />
                <span className="text-[9px] text-muted/70">{h.attribution}</span>
              </span>
            </div>
          ))}
        </div>
      ))}
      <div className="pt-0.5 text-[10px] text-muted">
        Orientačné — dopyt v ťažisku parcely do uvedeného pásma. Zdroje: ŠGÚDŠ (geológia/geohazardy), NLC (lesy/vodné toky).
        {errs > 0 ? " Niektoré zdroje práve nedostupné." : ""} Overte vždy na príslušnom úrade.
      </div>
    </div>
  );
}
