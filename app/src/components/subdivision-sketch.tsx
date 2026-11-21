// Náčrt navrhnutého delenia celku (GOLD-12): cesta (styk s ňou) dole, pozemky očíslované v poradí zoznamu výmer.
// Súradnice sú miestne metre z Macu (gold12_solver._sketch). Používa karta Delenie celkov aj list nehnuteľnosti.
// tone (2026-11-21, Investičné celky): index okruhu vlastníkov pre každý diel (-1 = mimo plánu, sivý); bldg = pôdorysy NAD dielmi.
export type Sketch = { w: number; h: number; site: string; lots: string[]; road: string | null; front: string | null; houses?: string[]; tone?: number[]; bldg?: string[] };

const TONES = ["rgba(91,122,88,.42)", "rgba(176,120,60,.40)", "rgba(70,110,160,.38)", "rgba(160,80,110,.36)", "rgba(130,130,50,.42)",
  "rgba(50,140,140,.38)", "rgba(120,90,170,.36)", "rgba(150,100,70,.34)"];
const lotFill = (s: Sketch, i: number): string => {
  const t = s.tone ? s.tone[i] : undefined;
  if (t === undefined) return i % 2 ? "rgba(91,122,88,.32)" : "rgba(91,122,88,.18)";
  return t < 0 ? "rgba(140,140,140,.12)" : TONES[t % TONES.length];
};

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
        <path key={i} d={d} fill={lotFill(s, i)} stroke="var(--color-green)"
          strokeWidth={1} vectorEffect="non-scaling-stroke" />
      ))}
      {(s.bldg ?? []).map((d, i) => <path key={`b${i}`} d={d} fill="var(--color-ink-soft)" fillOpacity={0.8} />)}
      {s.road ? <path d={s.road} fill="var(--color-muted)" fillOpacity={0.55} stroke="var(--color-ink-soft)" strokeWidth={0.8} vectorEffect="non-scaling-stroke" /> : null}
      {s.front ? <path d={s.front} fill="var(--color-ink)" /> : null}
      {numbered && s.lots.map((d, i) => {
        const c = pathCenter(d);
        return c ? <text key={i} x={c[0]} y={c[1]} fontSize={fs} textAnchor="middle" dominantBaseline="central" fill="var(--color-ink)">{i + 1}</text> : null;
      })}
    </svg>
  );
}

