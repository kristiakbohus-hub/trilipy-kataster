type PoiHit = { name: string | null; dist: number; drive_min: number } | null;
type Access = { transport: Record<string, PoiHit>; amenities: Record<string, PoiHit>; infra: Record<string, PoiHit> };

const LABELS: Record<string, { icon: string; label: string }> = {
  metro: { icon: "🚇", label: "Metro" }, elektricka: { icon: "🚊", label: "Električka" },
  vlak: { icon: "🚆", label: "Vlak" }, autobus: { icon: "🚌", label: "Autobus" },
  skola: { icon: "🏫", label: "Škola" }, skolka: { icon: "🧸", label: "Škôlka" },
  lekaren: { icon: "💊", label: "Lekáreň" }, lekar: { icon: "🩺", label: "Lekár / nemocnica" },
  obchod: { icon: "🛒", label: "Obchod" }, restauracia: { icon: "🍽️", label: "Reštaurácia" },
  banka: { icon: "🏦", label: "Banka / bankomat" }, park: { icon: "🌳", label: "Park" },
  dialnica: { icon: "🛣️", label: "Diaľnica (nájazd)" },
};

function distColor(m: number): string {
  return m <= 600 ? "#5b7a58" : m <= 1500 ? "#c9a45c" : "#a05252";
}
function fmtDist(m: number): string {
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`;
}

function Row({ k, hit }: { k: string; hit: PoiHit }) {
  const meta = LABELS[k];
  return (
    <div className="flex items-center justify-between gap-2 border-b border-line/40 py-1">
      <span className="flex min-w-0 items-center gap-1.5">
        <span>{meta.icon}</span>
        <span className="text-muted">{meta.label}</span>
        {hit?.name ? <span className="truncate text-fg">{hit.name}</span> : null}
      </span>
      {hit ? (
        <span className="whitespace-nowrap text-right">
          <span style={{ color: distColor(hit.dist) }}>{fmtDist(hit.dist)}</span>
          <span className="ml-1 text-[10px] text-muted">· ~{hit.drive_min} min autom</span>
        </span>
      ) : <span className="text-[11px] text-muted">nedostupné</span>}
    </div>
  );
}

export function AccessibilityPanel({ data }: { data: Access }) {
  const transportKeys = ["metro", "elektricka", "vlak", "autobus"].filter((k) => k in data.transport);
  const amenityKeys = ["skola", "skolka", "lekaren", "lekar", "obchod", "restauracia", "banka", "park"].filter((k) => k in data.amenities);
  const infraKeys = ["dialnica"].filter((k) => k in data.infra);
  return (
    <div className="space-y-2 text-xs">
      <div className="rounded-md border border-line bg-surface-2/30 p-2">
        <div className="mb-1 font-semibold text-fg">🚉 Dopravná dostupnosť</div>
        {transportKeys.map((k) => <Row key={k} k={k} hit={data.transport[k]} />)}
        {infraKeys.map((k) => <Row key={k} k={k} hit={data.infra[k]} />)}
      </div>
      <div className="rounded-md border border-line bg-surface-2/30 p-2">
        <div className="mb-1 font-semibold text-fg">🏙️ Občianska vybavenosť</div>
        {amenityKeys.map((k) => <Row key={k} k={k} hit={data.amenities[k]} />)}
      </div>
      <div className="text-[10px] text-muted">Zdroj: OpenStreetMap · vzdušnou čiarou; čas autom je hrubý odhad (45 km/h).</div>
    </div>
  );
}
