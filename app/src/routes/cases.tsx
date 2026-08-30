import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { addCaseNote, createCase, getCase, getDatasets, listCases, updateCaseStatus } from "../lib/api/kataster.functions";
import { CASE_KIND_LABEL, CASE_STATUS_META, type Case, type CaseNote } from "../lib/domain";
import { Badge, Card, Disclaimer, SectionHeader } from "../components/kit";
import { useRole } from "../lib/role-context";

type Kind = "vysporiadanie" | "screening" | "pristup" | "ine";

export const Route = createFileRoute("/cases")({
  head: () => ({ meta: [{ title: "Cases — TRI LIPY KATASTER CORE" }] }),
  loader: async () => ({ cases: await listCases(), datasets: await getDatasets() }),
  component: CasesPage,
});

function CasesPage() {
  const { cases, datasets } = Route.useLoaderData();
  const { role } = useRole();
  const router = useRouter();
  const usable = datasets.filter((d) => d.status !== "blocked");

  const [datasetId, setDatasetId] = useState(usable[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<Kind>("vysporiadanie");
  const [nextSteps, setNextSteps] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [selected, setSelected] = useState<{ case: (Case & { ku_name: string }) | null; notes: CaseNote[] } | null>(null);
  const [noteBody, setNoteBody] = useState("");

  async function openCase(id: number) {
    const r = await getCase({ data: { id } });
    setSelected(r as { case: (Case & { ku_name: string }) | null; notes: CaseNote[] });
  }

  async function create() {
    if (!datasetId || title.trim().length < 3) { setMsg("Zadaj dataset a názov (min. 3 znaky)."); return; }
    setBusy(true); setMsg(null);
    try {
      const r = await createCase({ data: { datasetId, title: title.trim(), kind, nextSteps: nextSteps.trim() || undefined, role } });
      setMsg(r.ok ? "Case vytvorený." : r.message ?? "Neúspešné.");
      if (r.ok) { setTitle(""); setNextSteps(""); }
      router.invalidate();
    } finally { setBusy(false); }
  }

  async function setStatus(id: number, status: "open" | "review" | "done") {
    await updateCaseStatus({ data: { id, status, role } });
    router.invalidate();
    void openCase(id);
  }

  async function addNote() {
    if (!selected?.case || noteBody.trim().length < 2) return;
    await addCaseNote({ data: { caseId: selected.case.id, body: noteBody.trim(), role } });
    setNoteBody("");
    void openCase(selected.case.id);
    router.invalidate();
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-fg">Cases</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Pracovné prípady viazané na dataset a aktíva — status, poznámky, ďalšie kroky. Nie je to outreach CRM.
        </p>
      </div>

      {/* Vytvoriť case */}
      <Card className="p-5">
        <SectionHeader title="Nový case" hint="Viaže sa na dataset; odkazuje na aktíva, nekopíruje dáta." />
        <div className="grid gap-3 md:grid-cols-6">
          <select value={datasetId} onChange={(e) => setDatasetId(e.target.value)} className="rounded-md border border-line bg-paper px-3 py-2 text-sm text-fg outline-none focus:border-brand md:col-span-2">
            {usable.map((d) => <option key={d.id} value={d.id}>{d.ku_name}</option>)}
          </select>
          <select value={kind} onChange={(e) => setKind(e.target.value as Kind)} className="rounded-md border border-line bg-paper px-3 py-2 text-sm text-fg outline-none focus:border-brand">
            {(Object.keys(CASE_KIND_LABEL) as Kind[]).map((k) => <option key={k} value={k}>{CASE_KIND_LABEL[k]}</option>)}
          </select>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Názov case" className="rounded-md border border-line bg-paper px-3 py-2 text-sm text-fg outline-none focus:border-brand md:col-span-3" />
          <input value={nextSteps} onChange={(e) => setNextSteps(e.target.value)} placeholder="Ďalšie kroky (voliteľné)" className="rounded-md border border-line bg-paper px-3 py-2 text-sm text-fg outline-none focus:border-brand md:col-span-5" />
          <button onClick={create} disabled={busy} className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-cream disabled:opacity-50">
            {busy ? "…" : "Vytvoriť"}
          </button>
        </div>
        {msg ? <div className="mt-3 text-sm text-muted">{msg}</div> : null}
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* Zoznam */}
        <div>
          <SectionHeader title="Prípady" hint={`${cases.length} záznamov`} />
          <Card className="divide-y divide-line">
            {cases.length === 0 ? (
              <div className="p-4 text-sm text-muted">Žiadne cases.</div>
            ) : (
              cases.map((c) => {
                const sm = CASE_STATUS_META[c.status] ?? { label: c.status, color: "#8a8a8a" };
                return (
                  <button
                    key={c.id}
                    onClick={() => openCase(c.id)}
                    className={"block w-full px-4 py-3 text-left transition-colors hover:bg-surface-2 " + (selected?.case?.id === c.id ? "bg-surface-2" : "")}
                    style={selected?.case?.id === c.id ? { boxShadow: "inset 2px 0 0 #333333" } : undefined}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-fg">{c.title}</span>
                      <Badge color={sm.color}>{sm.label}</Badge>
                    </div>
                    <div className="mt-0.5 text-xs text-muted">
                      {c.ku_name} · {CASE_KIND_LABEL[c.kind] ?? c.kind}
                      {c.linked_ref ? ` · ${c.linked_ref}` : ""} · {c.note_count} pozn.
                    </div>
                  </button>
                );
              })
            )}
          </Card>
        </div>

        {/* Detail */}
        <div>
          <SectionHeader title={selected?.case ? selected.case.title : "Detail case"} hint="Poznámky a stav" />
          <Card className="p-4">
            {!selected?.case ? (
              <div className="text-sm text-muted">Vyber case vľavo.</div>
            ) : (
              <div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge color={(CASE_STATUS_META[selected.case.status] ?? { color: "#8a8a8a" }).color}>
                    {(CASE_STATUS_META[selected.case.status] ?? { label: selected.case.status }).label}
                  </Badge>
                  <span className="text-muted">{selected.case.ku_name} · {CASE_KIND_LABEL[selected.case.kind] ?? selected.case.kind}</span>
                  {selected.case.owner_role ? <span className="text-muted">· vlastník: {selected.case.owner_role}</span> : null}
                </div>
                {selected.case.next_steps ? (
                  <div className="mt-3 rounded-md border border-line bg-surface-2/50 p-3 text-sm">
                    <div className="text-[11px] uppercase tracking-wide text-muted">Ďalšie kroky</div>
                    <div className="mt-0.5 text-fg">{selected.case.next_steps}</div>
                  </div>
                ) : null}

                <div className="mt-3 flex gap-1.5">
                  {(["open", "review", "done"] as const).map((s) => (
                    <button key={s} onClick={() => setStatus(selected.case!.id, s)} className="rounded-md border border-line px-2.5 py-1 text-xs text-fg hover:bg-surface-2">
                      → {(CASE_STATUS_META[s]).label}
                    </button>
                  ))}
                </div>

                <div className="mt-4 border-t border-line pt-3">
                  <div className="mb-2 text-[11px] uppercase tracking-wide text-muted">Poznámky ({selected.notes.length})</div>
                  <ul className="space-y-2">
                    {selected.notes.map((n) => (
                      <li key={n.id} className="text-sm">
                        <span className="text-fg">{n.body}</span>
                        <div className="text-[11px] text-muted">{n.author_role} · {n.created_at}</div>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3 flex gap-2">
                    <input value={noteBody} onChange={(e) => setNoteBody(e.target.value)} placeholder="Pridať poznámku…" className="flex-1 rounded-md border border-line bg-paper px-3 py-1.5 text-sm text-fg outline-none focus:border-brand" />
                    <button onClick={addNote} className="rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-cream">Pridať</button>
                  </div>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>

      <Disclaimer>
        Cases odkazujú na dataset a aktíva (nekopírujú dáta). Citlivé owner údaje ostávajú rolovo chránené. Case
        nie je nástroj na automatický outreach ani kontaktovanie vlastníkov.
      </Disclaimer>
    </div>
  );
}
