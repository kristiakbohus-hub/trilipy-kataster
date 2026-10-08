import { useCallback, useEffect, useState } from "react";
import {
  addContact, getContacts, CONTACT_CHANNELS, CONTACT_OUTCOMES, type ContactRow,
} from "../lib/api/kataster.functions";
import { canSeeOwners, type Role } from "../lib/domain";
import { useAuth } from "../lib/auth-context";

// Záznam kontaktu s vlastníkom. Appka dovtedy príležitosť našla a tam to skončilo — nikde nebolo,
// komu sa už volalo, čo odpovedal a kedy sa ozvať znova.
const CHANNEL_LABEL: Record<string, string> = {
  list: "list", telefon: "telefón", email: "e-mail", osobne: "osobne", ine: "iné",
};
const OUTCOME_LABEL: Record<string, string> = {
  nezastihnuty: "nezastihnutý", zaujem: "záujem", nezaujem: "bez záujmu",
  rozmysli: "rozmyslí si to", dohoda: "dohoda", odmietol: "odmietol",
};
const OUTCOME_COLOR: Record<string, string> = {
  zaujem: "#5b7a58", dohoda: "#3f5a3c", rozmysli: "#9a7b3e",
  nezastihnuty: "#8a8a8a", nezaujem: "#9c4a40", odmietol: "#9c4a40",
};

export function ContactPanel({ datasetId, lvNo, ownerNames, role }: {
  datasetId: string; lvNo: number; ownerNames?: string[]; role: Role;
}) {
  const { token } = useAuth();
  const [rows, setRows] = useState<ContactRow[] | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [owner, setOwner] = useState("");
  const [channel, setChannel] = useState<(typeof CONTACT_CHANNELS)[number]>("telefon");
  const [outcome, setOutcome] = useState<(typeof CONTACT_OUTCOMES)[number]>("nezastihnuty");
  const [note, setNote] = useState("");
  const [nextAt, setNextAt] = useState("");
  const smie = canSeeOwners(role);

  const refresh = useCallback(() => {
    if (!smie) { setRows([]); return; }
    getContacts({ data: { token: token ?? undefined, datasetId, lvNo } })
      .then(setRows).catch(() => setRows([]));
  }, [token, datasetId, lvNo, smie]);
  useEffect(() => { refresh(); }, [refresh]);

  async function save() {
    if (!token) { setMsg("Zápis vyžaduje prihlásenie."); return; }
    setBusy(true); setMsg(null);
    try {
      const r = await addContact({ data: {
        token, datasetId, lvNo, ownerName: owner.trim() || undefined,
        channel, outcome, note: note.trim() || undefined, nextAt: nextAt || undefined,
      } });
      if (r.ok) {
        setMsg("Zapísané."); setNote(""); setNextAt(""); setOwner(""); setOpen(false); refresh();
      } else setMsg(r.message ?? "Zlyhalo.");
    } finally { setBusy(false); }
  }

  if (!smie) {
    return <p className="text-sm text-muted">Záznam kontaktu je viazaný na mená vlastníkov — tvoja rola k nim nemá prístup.</p>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setOpen((v) => !v)}
          className="rounded-md border border-line px-3 py-1.5 text-xs text-fg hover:bg-surface-2"
        >{open ? "Zrušiť" : "+ Zapísať kontakt"}</button>
        {msg ? <span className="text-xs text-muted">{msg}</span> : null}
      </div>

      {open ? (
        <div className="mt-3 space-y-2 rounded-lg border border-line bg-surface-2/30 p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs text-muted">
              Koho sa to týka
              <select
                value={owner} onChange={(e) => setOwner(e.target.value)}
                className="mt-0.5 w-full rounded-md border border-line bg-paper px-2 py-1 text-sm text-fg"
              >
                <option value="">— celé LV —</option>
                {(ownerNames ?? []).map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <label className="text-xs text-muted">
              Kanál
              <select
                value={channel} onChange={(e) => setChannel(e.target.value as typeof channel)}
                className="mt-0.5 w-full rounded-md border border-line bg-paper px-2 py-1 text-sm text-fg"
              >
                {CONTACT_CHANNELS.map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}
              </select>
            </label>
            <label className="text-xs text-muted">
              Výsledok
              <select
                value={outcome} onChange={(e) => setOutcome(e.target.value as typeof outcome)}
                className="mt-0.5 w-full rounded-md border border-line bg-paper px-2 py-1 text-sm text-fg"
              >
                {CONTACT_OUTCOMES.map((o) => <option key={o} value={o}>{OUTCOME_LABEL[o]}</option>)}
              </select>
            </label>
            <label className="text-xs text-muted">
              Ozvať sa znova (nepovinné)
              <input
                type="date" value={nextAt} onChange={(e) => setNextAt(e.target.value)}
                className="mt-0.5 w-full rounded-md border border-line bg-paper px-2 py-1 text-sm text-fg"
              />
            </label>
          </div>
          <label className="block text-xs text-muted">
            Poznámka
            <textarea
              value={note} onChange={(e) => setNote(e.target.value)} rows={2}
              placeholder="Čo povedal, na čom ste sa dohodli…"
              className="mt-0.5 w-full rounded-md border border-line bg-paper px-2 py-1 text-sm text-fg"
            />
          </label>
          <button
            onClick={save} disabled={busy}
            className="rounded-md bg-ink px-3 py-1.5 text-xs font-medium text-cream disabled:opacity-60"
          >{busy ? "Zapisujem…" : "Zapísať"}</button>
        </div>
      ) : null}

      {rows == null ? (
        <p className="mt-3 text-xs text-muted">Načítavam…</p>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-xs text-muted">Zatiaľ žiadny zaznamenaný kontakt k tomuto LV.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-start justify-between gap-2 py-2 text-sm">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span style={{ color: OUTCOME_COLOR[r.outcome] ?? "#8a8a8a" }} className="text-xs">
                    {OUTCOME_LABEL[r.outcome] ?? r.outcome}
                  </span>
                  <span className="text-xs text-muted">{CHANNEL_LABEL[r.channel] ?? r.channel}</span>
                  {r.owner_name ? <span className="text-xs text-fg">{r.owner_name}</span> : null}
                </div>
                {r.note ? <p className="mt-0.5 text-xs leading-relaxed text-muted">{r.note}</p> : null}
                {r.next_at ? (
                  <p className="mt-0.5 text-[11px]" style={{ color: "#9a7b3e" }}>
                    ozvať sa znova: {r.next_at}
                  </p>
                ) : null}
              </div>
              <span className="shrink-0 text-[11px] tabular-nums text-muted">
                {r.created_at?.slice(0, 16)}{r.author ? ` · ${r.author}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
