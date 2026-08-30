import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { getDeal, listDeals, updateDealStatus, updateDealTask, addDealNote } from "../lib/api/kataster.functions";
import { DEAL_STATUS, DEAL_STATUS_ORDER, TASK_STATE, TASK_STATE_ORDER, eur, m2 } from "../lib/domain";
import { Badge, Card, Disclaimer, Meter, SectionHeader, Stat } from "../components/kit";
import { useRole } from "../lib/role-context";

type DealListItem = Awaited<ReturnType<typeof listDeals>>[number];

function DealKpis({ deals }: { deals: DealListItem[] }) {
  const k = useMemo(() => {
    const by: Record<string, DealListItem[]> = {};
    for (const st of DEAL_STATUS_ORDER) by[st] = deals.filter((d) => d.status === st);
    const active = deals.filter((d) => d.status !== "closed_lost" && d.status !== "closed_won");
    const areaActive = active.reduce((a, d) => a + (d.total_area ?? 0), 0);
    const won = by["closed_won"].length, lost = by["closed_lost"].length;
    const conv = won + lost ? Math.round((100 * won) / (won + lost)) : null;
    const tasksTotal = deals.reduce((a, d) => a + d.task_count, 0);
    const tasksDone = deals.reduce((a, d) => a + d.task_done, 0);
    const now = Date.now();
    const ages = active.map((d) => (now - new Date(d.created_at.replace(" ", "T") + "Z").getTime()) / 86400000).filter((x) => x >= 0 && x < 100000);
    const avgAge = ages.length ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length) : null;
    const maxCol = Math.max(1, ...DEAL_STATUS_ORDER.map((st) => by[st].length));
    return { by, active, areaActive, won, lost, conv, tasksTotal, tasksDone, avgAge, maxCol };
  }, [deals]);

  if (deals.length === 0) return null;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Aktívne dealy" value={k.active.length} sub={`${deals.length} spolu`} />
        <Stat label="Výmera v pipeline" value={m2(k.areaActive)} sub="aktívne dealy" />
        <Stat label="Indikat. hodnota" value={eur(Math.round(k.areaActive * 3.5))} sub="~3,5 €/m² (hrubý odhad)" />
        <Stat label="Konverzia" value={k.conv == null ? "—" : `${k.conv} %`} sub={`${k.won} uzavreté / ${k.lost} zamietnuté`} />
      </div>
      <Card className="p-4">
        <SectionHeader title="Lievik po stavoch" hint={k.avgAge != null ? `Priem. vek aktívneho dealu: ${k.avgAge} dní` : undefined} />
        <div className="space-y-1.5">
          {DEAL_STATUS_ORDER.map((st) => (
            <div key={st} className="flex items-center gap-2 text-xs">
              <span className="w-28 shrink-0" style={{ color: DEAL_STATUS[st].color }}>{DEAL_STATUS[st].label}</span>
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full" style={{ width: `${(k.by[st].length / k.maxCol) * 100}%`, background: DEAL_STATUS[st].color }} />
              </div>
              <span className="w-6 shrink-0 text-right tabular-nums text-fg">{k.by[st].length}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 border-t border-line pt-2 text-xs text-muted">
          Postup oslovenia (úkony): <b className="text-fg">{k.tasksDone}</b> / {k.tasksTotal} vlastníkov vysporiadaných (súhlasí/podpísané)
          <div className="mt-1"><Meter value={k.tasksTotal ? (100 * k.tasksDone) / k.tasksTotal : 0} color="#5b7a58" /></div>
        </div>
      </Card>
    </div>
  );
}

type DealDetail = Awaited<ReturnType<typeof getDeal>>;

export const Route = createFileRoute("/deals")({
  head: () => ({ meta: [{ title: "Deal pipeline — TRI LIPY KATASTER CORE" }] }),
  loader: async () => await listDeals(),
  component: DealsPage,
});

function DealsPage() {
  const deals = Route.useLoaderData();
  const router = useRouter();
  const { role } = useRole();
  const [sel, setSel] = useState<string | null>(null);
  const [detail, setDetail] = useState<DealDetail | null>(null);
  const [noteBody, setNoteBody] = useState("");
  const [busy, setBusy] = useState(false);

  async function open(id: string) {
    setSel(id);
    setDetail(await getDeal({ data: { id, role } }));
  }
  async function setStatus(status: (typeof DEAL_STATUS_ORDER)[number]) {
    if (!sel) return;
    setBusy(true);
    try { await updateDealStatus({ data: { id: sel, status, role } }); await open(sel); router.invalidate(); }
    finally { setBusy(false); }
  }
  async function cycleTask(taskId: number, state: string) {
    const idx = TASK_STATE_ORDER.indexOf(state as (typeof TASK_STATE_ORDER)[number]);
    const next = TASK_STATE_ORDER[(idx + 1) % TASK_STATE_ORDER.length];
    await updateDealTask({ data: { id: taskId, state: next, role } });
    if (sel) await open(sel);
  }
  async function submitNote() {
    if (!sel || noteBody.trim().length < 1) return;
    await addDealNote({ data: { dealId: sel, body: noteBody.trim(), role } });
    setNoteBody("");
    await open(sel);
    router.invalidate();
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-fg">Deal pipeline</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Deal = list vlastníctva; jednotliví spoluvlastníci sú <b>úkony</b>. Presúvaj deal medzi stavmi, sleduj
          oslovenie po vlastníkoch a generuj <b>oslovovacie listy</b> (draft — odosielaš sám). Deal založíš z <Link to="/prilezitosti" className="text-green underline">Príležitostí</Link>.
        </p>
      </div>

      <DealKpis deals={deals} />

      {/* Board */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {DEAL_STATUS_ORDER.map((st) => {
          const col = deals.filter((d) => d.status === st);
          const meta = DEAL_STATUS[st];
          return (
            <div key={st} className="min-w-0">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold" style={{ color: meta.color }}>{meta.label}</span>
                <span className="text-[10px] text-muted">{col.length}</span>
              </div>
              <div className="space-y-2">
                {col.map((d) => (
                  <button key={d.id} onClick={() => void open(d.id)} className={"w-full rounded-lg border p-2.5 text-left " + (sel === d.id ? "border-ink bg-surface-2" : "border-line bg-surface hover:border-ink/40")}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-fg">LV {d.lv_no}</span>
                      <span className="text-xs font-bold tabular-nums text-fg">{d.score ?? "—"}</span>
                    </div>
                    <div className="truncate text-[11px] text-muted">{d.ku_name}</div>
                    <div className="mt-1 text-[10px] text-muted">úkony {d.task_done}/{d.task_count}</div>
                  </button>
                ))}
                {col.length === 0 ? <div className="rounded-lg border border-dashed border-line py-3 text-center text-[10px] text-muted">—</div> : null}
              </div>
            </div>
          );
        })}
      </div>

      {/* Detail */}
      {detail && detail.deal ? (
        <Card className="p-4">
          <div className="flex flex-wrap items-center gap-2 border-b border-line pb-3">
            <span className="text-sm font-semibold text-fg">LV č. {detail.deal.lv_no}</span>
            <span className="text-xs text-muted">{detail.deal.ku_name}</span>
            <Badge color="#333333">skóre {detail.deal.score ?? "—"}</Badge>
            <Link to="/vypis/$datasetId/$lvNo" params={{ datasetId: detail.deal.dataset_id, lvNo: String(detail.deal.lv_no) }} search={{ typ: "vypis" }} className="text-xs text-green hover:underline">Výpis LV →</Link>
            <button onClick={() => { setSel(null); setDetail(null); }} className="ml-auto text-muted hover:text-fg">✕</button>
          </div>

          {/* Stav */}
          <div className="mt-3">
            <div className="mb-1 text-[10px] uppercase tracking-wide text-muted">Stav</div>
            <div className="flex flex-wrap gap-1.5">
              {DEAL_STATUS_ORDER.map((st) => (
                <button key={st} onClick={() => void setStatus(st)} disabled={busy}
                  className={"rounded-full border px-3 py-1 text-xs font-medium " + (detail.deal!.status === st ? "text-cream" : "border-line bg-paper text-muted hover:text-fg")}
                  style={detail.deal!.status === st ? { background: DEAL_STATUS[st].color, borderColor: DEAL_STATUS[st].color } : undefined}>
                  {DEAL_STATUS[st].label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {/* Úkony (vlastníci) */}
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wide text-muted">Vlastníci / úkony ({detail.tasks.length})</span>
                {detail.access === "full" ? <button onClick={() => allLetters(detail)} className="text-[10px] text-green underline hover:opacity-70">Všetky listy (Word)</button> : null}
              </div>
              {detail.access !== "full" ? (
                <div className="rounded-md border border-line bg-surface-2/40 px-3 py-2 text-xs text-muted">Mená vlastníkov rola <b className="text-fg">{role}</b> nevidí (owner-masking).</div>
              ) : (
                <ul className="space-y-1.5">
                  {detail.tasks.map((t) => (
                    <li key={t.id} className="rounded-md border border-line px-2.5 py-1.5 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-fg">{t.owner_name}{t.is_company ? " (PO)" : ""}{t.share ? ` · ${t.share}` : ""}</span>
                        <button onClick={() => void cycleTask(t.id, t.state)} className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium text-cream" style={{ background: TASK_STATE[t.state]?.color ?? "#8a8a8a" }}>
                          {TASK_STATE[t.state]?.label ?? t.state}
                        </button>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between">
                        <span className="text-[10px] text-muted">{t.addr || "adresa neuvedená"}</span>
                        <button onClick={() => ownerLetter(detail.deal!, t)} className="text-[10px] text-green underline hover:opacity-70">List (Word)</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Poznámky */}
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-wide text-muted">Poznámky</div>
              <div className="flex gap-2">
                <input value={noteBody} onChange={(e) => setNoteBody(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void submitNote(); }} placeholder="Pridať poznámku…" className="min-w-0 flex-1 rounded-md border border-line bg-paper px-2.5 py-1.5 text-xs text-fg outline-none focus:border-ink" />
                <button onClick={() => void submitNote()} className="rounded-md bg-ink px-3 py-1.5 text-xs font-medium text-cream">+</button>
              </div>
              <ul className="mt-2 space-y-1.5">
                {detail.notes.map((n) => (
                  <li key={n.id} className="rounded-md bg-surface-2/40 px-2.5 py-1.5 text-xs">
                    <div className="text-fg">{n.body}</div>
                    <div className="text-[10px] text-muted">{n.author_role} · {n.created_at}</div>
                  </li>
                ))}
                {detail.notes.length === 0 ? <li className="text-[11px] text-muted">Zatiaľ bez poznámok.</li> : null}
              </ul>
            </div>
          </div>
        </Card>
      ) : (
        <div className="rounded-xl border border-dashed border-line bg-surface/50 p-6 text-center text-sm text-muted">
          {deals.length === 0 ? "Zatiaľ žiadne dealy — založ deal z Príležitostí." : "Vyber deal z boardu."}
        </div>
      )}

      <Disclaimer>
        Oslovovacie listy sú <b>pracovné drafty</b> (bez ceny) — odoslanie a finálnu podobu robíš mimo aplikácie.
        Owner-sensitive údaje (mená, adresy) vidí len rola s plným prístupom. Deal pipeline neslúži na právne úkony.
      </Disclaimer>
    </div>
  );
}

// ——— Oslovovací list (draft, .doc HTML — Word ho otvorí) ———
function he(v: string | number) { return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function download(content: string, mime: string, filename: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}
function letterBody(deal: NonNullable<DealDetail["deal"]>, t: DealDetail["tasks"][number]): string {
  return `<div style="font-family:Arial,sans-serif;color:#333;max-width:640px">`
    + `<div style="border-bottom:2px solid #333;padding-bottom:8px;margin-bottom:16px"><div style="font-size:20px;font-weight:bold;letter-spacing:3px">TRI LIPY</div><div style="font-size:9px;color:#777;letter-spacing:2px">RIEŠENIA PRE POZEMKY</div></div>`
    + `<div style="margin-bottom:24px">${he(t.owner_name)}<br>${he(t.addr || "")}</div>`
    + `<div style="margin-bottom:16px">Vec: <b>Záujem o odkúpenie spoluvlastníckeho podielu</b></div>`
    + `<p>Vážený vlastník,</p>`
    + `<p>obraciame sa na Vás ako na spoluvlastníka nehnuteľnosti evidovanej na <b>liste vlastníctva č. ${he(deal.lv_no)}</b> v katastrálnom území <b>${he(deal.ku_name || "")}</b>${t.share ? `, kde evidujeme Váš spoluvlastnícky podiel <b>${he(t.share)}</b>` : ""}.</p>`
    + `<p>Máme záujem o odkúpenie Vášho podielu, prípadne o dohodu na vysporiadaní spoluvlastníctva. Podmienky a cenu radi dohodneme individuálne podľa Vašich predstáv.</p>`
    + `<p>V prípade záujmu nás prosím kontaktujte na nižšie uvedených údajoch.</p>`
    + `<p style="margin-top:24px">S pozdravom,<br><b>TRI LIPY</b><br>__________________________<br>(kontakt doplní odosielateľ)</p>`
    + `<p style="font-size:10px;color:#888;margin-top:24px;border-top:1px solid #ccc;padding-top:6px">Tento list je pracovný návrh (draft). Nejde o právny úkon ani záväznú ponuku.</p>`
    + `</div>`;
}
function ownerLetter(deal: NonNullable<DealDetail["deal"]>, t: DealDetail["tasks"][number]) {
  const html = `<html xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"></head><body>${letterBody(deal, t)}</body></html>`;
  download("﻿" + html, "application/msword;charset=utf-8", `oslovenie_LV${deal.lv_no}_${t.id}.doc`);
}
function allLetters(detail: DealDetail) {
  if (!detail.deal) return;
  const blocks = detail.tasks.filter((t) => !t.is_company).map((t) => letterBody(detail.deal!, t)).join('<div style="page-break-before:always"></div>');
  const html = `<html xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"></head><body>${blocks}</body></html>`;
  download("﻿" + html, "application/msword;charset=utf-8", `oslovenia_LV${detail.deal.lv_no}.doc`);
}
