import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth-context";
import { addContact } from "../lib/api/kataster.functions";
import { defaultBody, privacyNote, splitAddress, type LetterJob } from "../lib/letters";

// Listy možným kupcom — z dossieru parcely („Kto by mohol kúpiť" → zaškrtnúť → Pripraviť listy).
// Appka NIČ neodosiela sama: pripraví listy na tlač/PDF, odoslanie robí človek a potom ho zaznamená.
// BEZ `loader` (pamäť cf_app_ssr_loader_leak) — výber prichádza cez sessionStorage.
export const Route = createFileRoute("/listy")({
  head: () => ({ meta: [{ title: "Listy kupcom — TRI LIPY KATASTER CORE" }] }),
  component: ListyPage,
});

type Sender = { name: string; address: string; phone: string; email: string };
const SENDER_KEY = "tl.sender";
type Draft = { addr: string; body: string; complete: boolean };

function ListyPage() {
  const { token } = useAuth();
  const [job, setJob] = useState<LetterJob | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [sender, setSender] = useState<Sender>({ name: "", address: "", phone: "", email: "" });
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const j = JSON.parse(sessionStorage.getItem("tl.letters") ?? "null") as LetterJob | null;
      if (j && Array.isArray(j.recipients)) {
        setJob(j);
        const d: Record<string, Draft> = {};
        for (const r of j.recipients) {
          const a = splitAddress(r.label);
          d[r.key] = { addr: [a.name, ...a.lines].join("\n"), body: defaultBody(r, j), complete: a.complete };
        }
        setDrafts(d);
      }
    } catch { /* bez výberu */ }
    try { const s = JSON.parse(localStorage.getItem(SENDER_KEY) ?? "null") as Sender | null; if (s) setSender(s); } catch { /* noop */ }
    setReady(true);
  }, []);

  const setS = (k: keyof Sender, v: string) => setSender((s) => {
    const n = { ...s, [k]: v };
    try { localStorage.setItem(SENDER_KEY, JSON.stringify(n)); } catch { /* noop */ }
    return n;
  });
  const setD = (key: string, k: "addr" | "body", v: string) => setDrafts((d) => ({ ...d, [key]: { ...d[key], [k]: v } }));

  if (!ready) return null;
  if (!job || !job.recipients.length) {
    return (
      <div className="space-y-2 p-4 text-sm text-muted">
        <p>Žiadne listy na prípravu. Otvor dossier parcely, v časti „Kto by mohol kúpiť" zaškrtni adresátov a klikni „Pripraviť listy".</p>
        <Link to="/kupci" className="text-brand hover:underline">Kupci a dopyt →</Link>
      </div>
    );
  }
  const j = job;
  const today = new Date().toLocaleDateString("sk-SK", { day: "numeric", month: "long", year: "numeric" });
  const senderReady = sender.name.trim().length > 1 && (sender.phone.trim() || sender.email.trim());

  async function logSent() {
    if (!token) return;
    if (!window.confirm(`Zaznamenať, že ${j.recipients.length} ${j.recipients.length === 1 ? "list bol odoslaný" : "listov bolo odoslaných"}? Zápis pôjde do záznamu kontaktov (výsledok „list odoslaný — čaká na odpoveď").`)) return;
    setBusy(true); let ok = 0; let err = "";
    try {
      for (const r of j.recipients) {
        const res = await addContact({ data: {
          token, datasetId: j.datasetId, parcelNo: j.parcelNo, lvNo: r.lvNo ?? undefined,
          ownerName: r.label.split(",")[0].slice(0, 300), channel: "list", outcome: "odoslane",
          note: `List — ${r.group === "sused" ? "sused" : r.group === "kupec" ? "vlastník v lokalite" : "firma"} · parc. ${j.parcelNo}`,
        } });
        if (res.ok) ok++; else err = res.message ?? "chyba";
      }
      setMsg(`Zaznamenané: ${ok} z ${j.recipients.length}${err ? ` · ${err}` : ""}.`);
    } finally { setBusy(false); }
  }

  const inp = "w-full rounded-md border border-line bg-paper px-2 py-1 text-sm text-fg";
  return (
    <div className="mx-auto max-w-[820px] space-y-4">
      <div className="space-y-3 print:hidden">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-xl font-semibold tracking-tight text-fg">Listy kupcom — parc. {j.parcelNo}{j.kuName ? `, k.ú. ${j.kuName}` : ""}</h1>
          <Link to="/report/$datasetId/$parcelNo" params={{ datasetId: j.datasetId, parcelNo: j.parcelNo }} className="text-xs text-muted hover:text-fg">← Späť na dossier</Link>
        </div>
        <p className="text-xs text-muted">
          Appka nič neodosiela. Skontroluj adresy a text, vytlač alebo ulož do PDF a po odoslaní to zaznamenaj.
          Text je zisťovanie záujmu — neponúkaj pozemok, ktorý nevlastníš a nemáš na to súhlas vlastníka.
        </p>
        <div className="grid gap-2 rounded-md border border-line p-3 sm:grid-cols-2">
          <label className="text-xs text-muted">Odosielateľ (meno / firma)<input value={sender.name} onChange={(e) => setS("name", e.target.value)} className={inp} /></label>
          <label className="text-xs text-muted">Adresa odosielateľa<input value={sender.address} onChange={(e) => setS("address", e.target.value)} className={inp} /></label>
          <label className="text-xs text-muted">Telefón<input value={sender.phone} onChange={(e) => setS("phone", e.target.value)} className={inp} /></label>
          <label className="text-xs text-muted">E-mail<input value={sender.email} onChange={(e) => setS("email", e.target.value)} className={inp} /></label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => window.print()} disabled={!senderReady} className="rounded-md bg-ink px-4 py-1.5 text-sm font-medium text-cream disabled:opacity-40">Tlačiť / uložiť PDF ({j.recipients.length})</button>
          <button onClick={() => void logSent()} disabled={busy} className="rounded-md border border-line px-3 py-1.5 text-sm text-fg hover:border-ink disabled:opacity-40">{busy ? "…" : "Zaznamenať odoslanie"}</button>
          {!senderReady ? <span className="text-xs text-muted">Doplň odosielateľa a aspoň telefón alebo e-mail.</span> : null}
          {msg ? <span className="text-xs text-muted">{msg}</span> : null}
        </div>
      </div>

      {j.recipients.map((r) => {
        const d = drafts[r.key];
        if (!d) return null;
        return (
          <article key={r.key} className="rounded-md border border-line bg-paper p-8 text-[13px] leading-relaxed text-fg print:rounded-none print:border-0 print:p-0" style={{ breakAfter: "page" }}>
            <div className="flex justify-between gap-6">
              <div className="whitespace-pre-line text-xs text-muted">{[sender.name, sender.address].filter(Boolean).join("\n")}</div>
              <div className="w-[46%]">
                <textarea value={d.addr} onChange={(e) => setD(r.key, "addr", e.target.value)} rows={4} className="w-full resize-none rounded border border-line bg-transparent p-1 text-[13px] print:hidden" aria-label="Adresa adresáta" />
                <div className="hidden whitespace-pre-line print:block">{d.addr}</div>
                {!d.complete ? <div className="mt-1 text-[11px] print:hidden" style={{ color: "#a4553a" }}>Adresa je neúplná — doplň ulicu a PSČ.</div> : null}
              </div>
            </div>
            <div className="mt-6 text-right text-xs text-muted">{today}</div>
            <div className="mt-4">
              <textarea value={d.body} onChange={(e) => setD(r.key, "body", e.target.value)} rows={10} className="w-full rounded border border-line bg-transparent p-1 text-[13px] leading-relaxed print:hidden" aria-label="Text listu" />
              <div className="hidden whitespace-pre-line print:block">{d.body}</div>
            </div>
            <div className="mt-6">S pozdravom</div>
            <div className="mt-6 whitespace-pre-line">{[sender.name, sender.phone && `tel. ${sender.phone}`, sender.email].filter(Boolean).join("\n")}</div>
            <p className="mt-10 border-t border-line pt-2 text-[10px] leading-snug text-muted">{privacyNote(r)}</p>
          </article>
        );
      })}
    </div>
  );
}
