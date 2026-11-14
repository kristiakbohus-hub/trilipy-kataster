// Náčrt navrhnutého delenia celku (GOLD-12): cesta (styk s ňou) dole, pozemky očíslované v poradí zoznamu výmer.
// Súradnice sú miestne metre z Macu (gold12_solver._sketch). Používa karta Delenie celkov aj list nehnuteľnosti.
export type Sketch = { w: number; h: number; site: string; lots: string[]; road: string | null; front: string | null; houses?: string[] };

/** Stred polygónu z cesty náčrtu (priemer vrcholov) — na číslo pozemku. */
function pathCenter(d: string): [number, number] | null {
  const pts = [...d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])] as [number, number]);
  if (!pts.length) return null;
  return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
}

// Náčrt najlepšieho variantu: cesta (styk s ňou) dole, pozemky očíslované v poradí zoznamu výmer.
export function SketchSvg({ s, label, numbered = true }: { s: Sketch; label: string; numbered?: boolean }) {
  const pad = Math.max(s.w, s.h) * 0.04 + 2;
  const fs = Math.max(s.w, s.h) / 16;
  return (
    <svg viewBox={`${-pad} ${-pad} ${s.w + 2 * pad} ${s.h + 2 * pad}`} role="img" aria-label={label}
      className="h-44 w-full rounded-md border border-line bg-cream">
      {(s.houses ?? []).map((d, i) => <path key={`h${i}`} d={d} fill="var(--color-ink-soft)" fillOpacity={0.75} />)}
      <path d={s.site} fill="var(--color-surface-2)" stroke="var(--color-ink)" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
      {s.lots.map((d, i) => (
        <path key={i} d={d} fill={i % 2 ? "rgba(91,122,88,.32)" : "rgba(91,122,88,.18)"} stroke="var(--color-green)"
          strokeWidth={1} vectorEffect="non-scaling-stroke" />
      ))}
      {s.road ? <path d={s.road} fill="var(--color-muted)" fillOpacity={0.55} stroke="var(--color-ink-soft)" strokeWidth={0.8} vectorEffect="non-scaling-stroke" /> : null}
      {s.front ? <path d={s.front} fill="var(--color-ink)" /> : null}
      {numbered && s.lots.map((d, i) => {
        const c = pathCenter(d);
        return c ? <text key={i} x={c[0]} y={c[1]} fontSize={fs} textAnchor="middle" dominantBaseline="central" fill="var(--color-ink)">{i + 1}</text> : null;
      })}
    </svg>
  );
}

