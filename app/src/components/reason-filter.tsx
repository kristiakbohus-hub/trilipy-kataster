// FILTER PODĽA DÔVODU (2026-11-13, rozhodnutie vlastníka „Filtre podľa dôvodu"): nálezy „na preskúmanie" rozdelené podľa
// toho, čo treba overiť — tlačidlá s počtami, klik filtruje. Dôvod odvodí karta z textu dôvodu alebo z kľúčov kritérií.
export function ReasonFilter({ counts, value, onChange }: {
  counts: [string, number][]; value: string | null; onChange: (v: string | null) => void;
}) {
  if (!counts.length) return null;
  const total = counts.reduce((t, [, n]) => t + n, 0);
  const btn = (active: boolean) => `rounded-full border px-2.5 py-0.5 text-[11px] ${active ? "border-ink bg-ink text-cream" : "border-line text-fg hover:bg-surface-2"}`;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="text-muted">Čo treba overiť:</span>
      <button className={btn(value === null)} onClick={() => onChange(null)}>všetko ({total})</button>
      {counts.map(([k, n]) => (
        <button key={k} className={btn(value === k)} onClick={() => onChange(value === k ? null : k)}>{k} ({n})</button>
      ))}
    </div>
  );
}

/** Počty dôvodov zoradené od najčastejšieho. */
export function reasonCounts<T>(rows: T[], reasonOf: (r: T) => string): [string, number][] {
  const m = new Map<string, number>();
  for (const r of rows) { const k = reasonOf(r); m.set(k, (m.get(k) ?? 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

/** Dôvod z kľúčov otvorených kritérií (GOLD-10/19) alebo z textu poznámok. */
export function reasonFromKeys(keys: string[] | undefined, text: string, map: Record<string, string>, textMap: [RegExp, string][]): string {
  for (const k of keys ?? []) if (map[k]) return map[k];
  for (const [re, lab] of textMap) if (re.test(text)) return lab;
  return "iné";
}
