import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { submitDataSubjectRequest, listDataSubjectRequests, applyErasure, getDataSubjectRecord, listAllowedSignups, addAllowedSignup, removeAllowedSignup, listUsers, setUserRole, revokeUserSessions, type DsrRow, type AllowedSignup, type UserRow } from "../lib/api/kataster.functions";
import { Card, SectionHeader } from "../components/kit";
import { useAuth } from "../lib/auth-context";
import { ROLES, type Role } from "../lib/domain";

export const Route = createFileRoute("/gdpr")({
  head: () => ({ meta: [{ title: "GDPR — práva dotknutých osôb — TRI LIPY KATASTER CORE" }] }),
  component: GdprPage,
});

const KIND_LABEL: Record<string, string> = { erasure: "výmaz (čl. 17)", objection: "námietka (čl. 21)", access: "prístup (čl. 15)", rectification: "oprava (čl. 16)" };

function GdprPage() {
  const { token } = useAuth();
  const [data, setData] = useState<Awaited<ReturnType<typeof listDataSubjectRequests>> | null>(null);
  const [kind, setKind] = useState<"erasure" | "objection" | "access" | "rectification">("objection");
  const [name, setName] = useState("");
  const [ku, setKu] = useState("");
  const [lv, setLv] = useState("");
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lookup, setLookup] = useState<Awaited<ReturnType<typeof getDataSubjectRecord>> | null>(null);
  const [lookupName, setLookupName] = useState("");
  const [allow, setAllow] = useState<Awaited<ReturnType<typeof listAllowedSignups>> | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [newNote, setNewNote] = useState("");
  const [users, setUsers] = useState<Awaited<ReturnType<typeof listUsers>> | null>(null);
  // výmaz: náhľad nájdených záznamov → admin zaškrtne, čo naozaj patrí osobe → zmažú sa len tie
  const [eraseReq, setEraseReq] = useState<DsrRow | null>(null);
  const [eraseRows, setEraseRows] = useState<Awaited<ReturnType<typeof getDataSubjectRecord>>["rows"]>([]);
  const [eraseSel, setEraseSel] = useState<Set<number>>(new Set());
  // tá istá osoba v evidencii dopytu (kupci) — ručne zadaná alebo lead z OS TRI LIPY
  const [eraseBuyers, setEraseBuyers] = useState<Awaited<ReturnType<typeof getDataSubjectRecord>>["buyers"]>([]);
  const [eraseBuyerSel, setEraseBuyerSel] = useState<Set<number>>(new Set());

  const refresh = useCallback(() => {
    if (!token) return;
    listDataSubjectRequests({ data: { token } }).then(setData).catch(() => {});
    listAllowedSignups({ data: { token } }).then(setAllow).catch(() => {});
    listUsers({ data: { token } }).then(setUsers).catch(() => {});
  }, [token]);
  useEffect(() => { refresh(); }, [refresh]);

  if (!token) return <div className="p-4 text-sm text-muted">Prihlás sa.</div>;

  async function submit() {
    if (name.trim().length < 2) { setMsg("Zadaj meno dotknutej osoby."); return; }
    setBusy(true);
    try {
      const r = await submitDataSubjectRequest({ data: { token: token!, kind, subjectName: name.trim(), subjectKu: ku || undefined, subjectLv: lv || undefined, reason: reason || undefined } });
      setMsg(r.ok ? `Žiadosť zaevidovaná${(kind === "objection" || kind === "erasure") ? " + osoba pridaná do suppression (neoslovovať)." : "."}` : (r.message ?? "Zlyhalo."));
      setName(""); setKu(""); setLv(""); setReason(""); refresh();
    } finally { setBusy(false); }
  }
  async function openErase(req: DsrRow) {
    setEraseReq(req); setEraseSel(new Set()); setEraseRows([]); setEraseBuyers([]); setEraseBuyerSel(new Set());
    const r = await getDataSubjectRecord({ data: { token: token!, name: req.subject_name, ku: req.subject_ku ?? undefined, lv: req.subject_lv ?? undefined } });
    setEraseRows(r.rows); setEraseBuyers(r.buyers ?? []);
  }
  function toggleErase(id: number) {
    setEraseSel((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }
  function toggleBuyer(id: number) {
    setEraseBuyerSel((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }
  const eraseCount = eraseSel.size + eraseBuyerSel.size;
  async function erase() {
    if (!eraseReq || !eraseCount) return;
    const parts = [eraseSel.size ? `${eraseSel.size} ${eraseSel.size === 1 ? "záznam" : eraseSel.size < 5 ? "záznamy" : "záznamov"} vlastníka` : null,
      eraseBuyerSel.size ? `${eraseBuyerSel.size} ${eraseBuyerSel.size === 1 ? "záznam" : eraseBuyerSel.size < 5 ? "záznamy" : "záznamov"} v evidencii dopytu` : null].filter(Boolean).join(" a ");
    if (!window.confirm(`Natrvalo vymazať ${parts} (žiadosť #${eraseReq.id})? Nedá sa to vrátiť a pri ďalšom importe ani poslaní z OS TRI LIPY sa tieto záznamy nevrátia.`)) return;
    const r = await applyErasure({ data: { token: token!, requestId: eraseReq.id, ownerIds: [...eraseSel], buyerIds: [...eraseBuyerSel] } });
    setMsg(r.ok ? `Výmaz hotový — odstránených ${r.removed ?? 0} záznamov vlastníka${r.work ? `, ${r.work} pracovných záznamov (kontakty, úlohy)` : ""}${r.buyers ? `, ${r.buyers} v evidencii dopytu` : ""}.` : (r.message ?? "Zlyhalo."));
    if (r.ok) { setEraseReq(null); setEraseRows([]); setEraseSel(new Set()); setEraseBuyers([]); setEraseBuyerSel(new Set()); }
    refresh();
  }
  async function doLookup() {
    if (lookupName.trim().length < 2) return;
    const r = await getDataSubjectRecord({ data: { token: token!, name: lookupName.trim() } });
    setLookup(r);
  }
  async function addAllow() {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(newEmail.trim())) { setMsg("Zadaj platný email."); return; }
    const r = await addAllowedSignup({ data: { token: token!, email: newEmail.trim(), note: newNote || undefined } });
    setMsg(r.ok ? "Email pridaný — smie sa zaregistrovať." : (r.message ?? "Zlyhalo.")); setNewEmail(""); setNewNote(""); refresh();
  }
  async function delAllow(email: string) {
    if (!window.confirm(`Odobrať ${email} z povolených registrácií? (existujúci účet tým nezmizne)`)) return;
    const r = await removeAllowedSignup({ data: { token: token!, email } });
    setMsg(r.ok ? "Email odobraný z prístupov." : (r.message ?? "Zlyhalo.")); refresh();
  }

  async function changeRole(u: UserRow, role: Role) {
    if (role === u.role) return;
    if (!window.confirm(`Zmeniť rolu ${u.email} z „${u.role}" na „${role}"?`)) return;
    const r = await setUserRole({ data: { token: token!, userId: u.id, newRole: role } });
    setMsg(r.ok ? `Rola ${u.email} → ${role}.` : (r.message ?? "Zlyhalo.")); refresh();
  }
  async function revoke(u: UserRow) {
    if (!window.confirm(`Odhlásiť ${u.email} na všetkých zariadeniach?`)) return;
    const r = await revokeUserSessions({ data: { token: token!, userId: u.id } });
    setMsg(r.ok ? `Odhlásené: ${r.removed ?? 0} relácií.` : (r.message ?? "Zlyhalo.")); refresh();
  }

  const isAdmin = data?.access === true;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-fg">GDPR — práva dotknutých osôb</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">Evidencia žiadostí (výmaz / námietka / prístup / oprava) a suppression list (koho nespracúvať a neoslovovať). Orientačný nástroj — procesy a lehoty konzultuj s DPO/právnikom. Owner-sensitive dáta sú aj tak rolovo maskované.</p>
      </div>

      <Card className="p-4">
        <SectionHeader title="Zaevidovať žiadosť dotknutej osoby" hint="námietka/výmaz → hneď do suppression" />
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label className="text-sm text-muted">Typ
            <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className="mt-1 w-full rounded-md border border-line bg-paper px-2 py-2 text-sm text-fg">
              {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
          <label className="text-sm text-muted">Meno dotknutej osoby
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Meno Priezvisko" className="mt-1 w-full rounded-md border border-line bg-paper px-2 py-2 text-sm text-fg" />
          </label>
          <label className="text-sm text-muted">k.ú. kód (nepovinné)
            <input value={ku} onChange={(e) => setKu(e.target.value)} placeholder="napr. 808393" className="mt-1 w-full rounded-md border border-line bg-paper px-2 py-2 text-sm text-fg" />
          </label>
          <label className="text-sm text-muted">LV (nepovinné)
            <input value={lv} onChange={(e) => setLv(e.target.value)} className="mt-1 w-full rounded-md border border-line bg-paper px-2 py-2 text-sm text-fg" />
          </label>
          <label className="text-sm text-muted sm:col-span-2">Dôvod / poznámka (nepovinné)
            <input value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full rounded-md border border-line bg-paper px-2 py-2 text-sm text-fg" />
          </label>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <button onClick={() => void submit()} disabled={busy} className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-cream disabled:opacity-50">{busy ? "…" : "Zaevidovať"}</button>
          {msg ? <span className="text-[12px] text-muted">{msg}</span> : null}
        </div>
      </Card>

      <Card className="p-4">
        <SectionHeader title={`Žiadosti${data ? ` (${data.requests.length})` : ""}`} hint={isAdmin ? `suppression: ${data?.suppressionCount ?? 0}` : "len admin vidí zoznam"} />
        {!isAdmin ? (
          <div className="mt-2 text-sm text-muted">Zoznam žiadostí a výmaz vidí len rola admin. Žiadosť vyššie môžeš zaevidovať aj bez toho.</div>
        ) : data && data.requests.length ? (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-muted">
                <th className="px-2 py-1">Dátum</th><th className="px-2 py-1">Typ</th><th className="px-2 py-1">Osoba</th><th className="px-2 py-1">k.ú./LV</th><th className="px-2 py-1">Stav</th><th className="px-2 py-1"></th>
              </tr></thead>
              <tbody className="divide-y divide-line">
                {data.requests.map((r: DsrRow) => (
                  <tr key={r.id}>
                    <td className="px-2 py-1 text-[11px] text-muted">{r.created_at?.slice(0, 16)}</td>
                    <td className="px-2 py-1 text-fg">{KIND_LABEL[r.kind] ?? r.kind}</td>
                    <td className="px-2 py-1 text-fg">{r.subject_name}</td>
                    <td className="px-2 py-1 text-muted">{[r.subject_ku, r.subject_lv].filter(Boolean).join(" / ") || "—"}</td>
                    <td className="px-2 py-1">{r.status === "resolved" ? <span className="text-green">vybavené</span> : <span className="text-muted">nové</span>}</td>
                    <td className="px-2 py-1">{r.kind === "erasure" && r.status !== "resolved" ? <button onClick={() => void openErase(r)} className="rounded-md border border-line px-2 py-0.5 text-xs text-fg hover:border-ink">Vybaviť výmaz</button> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="mt-2 text-sm text-muted">Žiadne žiadosti.</div>}
        {isAdmin && eraseReq ? (
          <div className="mt-4 rounded-md border border-line p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="text-sm font-medium text-fg">Výmaz — žiadosť #{eraseReq.id}: {eraseReq.subject_name}</div>
              <button onClick={() => { setEraseReq(null); setEraseRows([]); setEraseBuyers([]); }} className="text-xs text-muted hover:text-fg">Zrušiť</button>
            </div>
            <p className="mt-1 text-[12px] text-muted">Zaškrtni len záznamy, ktoré patria tejto osobe — rovnaké meno môžu mať aj iní ľudia (over dátum narodenia, rodné priezvisko a adresu). Zmažú sa iba zaškrtnuté a ďalší import k.ú. ich nevráti.</p>
            {eraseRows.length ? (
              <div className="mt-2 max-h-80 overflow-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-muted">
                    <th className="px-2 py-1"></th><th className="px-2 py-1">Meno</th><th className="px-2 py-1">Narodenie / rodné</th><th className="px-2 py-1">Adresa</th><th className="px-2 py-1">k.ú. / LV</th><th className="px-2 py-1">Podiel</th>
                  </tr></thead>
                  <tbody className="divide-y divide-line">
                    {eraseRows.map((o) => (
                      <tr key={o.id} className={eraseSel.has(o.id) ? "bg-cream" : ""}>
                        <td className="px-2 py-1"><input type="checkbox" checked={eraseSel.has(o.id)} onChange={() => toggleErase(o.id)} aria-label={`Vybrať ${o.name}, LV ${o.lv_no}`} /></td>
                        <td className="px-2 py-1 text-fg">{o.name}</td>
                        <td className="px-2 py-1 text-[12px] text-muted">{[o.birth_date, o.born_name ? `rod. ${o.born_name}` : null].filter(Boolean).join(" · ") || "—"}</td>
                        <td className="px-2 py-1 text-[12px] text-muted">{[o.addr_obec, o.addr_cislo, o.addr_psc].filter(Boolean).join(", ") || "—"}</td>
                        <td className="px-2 py-1 text-[12px] text-muted">{o.dataset_id} · LV {o.lv_no}</td>
                        <td className="px-2 py-1 text-[12px] text-muted">{o.share ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <div className="mt-2 text-sm text-muted">V katastri žiadny záznam s týmto menom{eraseReq.subject_ku ? " v zadanom k.ú." : ""}.</div>}
            {eraseBuyers.length ? (
              <div className="mt-3">
                <div className="text-[11px] uppercase tracking-wide text-muted">Evidencia dopytu (kupci)</div>
                <div className="mt-1 max-h-60 overflow-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-muted">
                      <th className="px-2 py-1"></th><th className="px-2 py-1">Meno</th><th className="px-2 py-1">Dopyt</th><th className="px-2 py-1">Lokality</th><th className="px-2 py-1">Zdroj</th><th className="px-2 py-1">Zadané</th>
                    </tr></thead>
                    <tbody className="divide-y divide-line">
                      {eraseBuyers.map((b) => (
                        <tr key={b.id} className={eraseBuyerSel.has(b.id) ? "bg-cream" : ""}>
                          <td className="px-2 py-1"><input type="checkbox" checked={eraseBuyerSel.has(b.id)} onChange={() => toggleBuyer(b.id)} aria-label={`Vybrať dopyt #${b.id} ${b.name}`} /></td>
                          <td className="px-2 py-1 text-fg">{b.name}{b.contact ? <span className="block text-[11px] text-muted">{b.contact}</span> : null}</td>
                          <td className="px-2 py-1 text-[12px] text-muted">#{b.id} · {b.ptype} · {b.status}</td>
                          <td className="px-2 py-1 text-[12px] text-muted">{b.locations || "kdekoľvek"}</td>
                          <td className="px-2 py-1 text-[12px] text-muted">{b.source === "os_tri_lipy" ? "OS TRI LIPY" : "ručne"}</td>
                          <td className="px-2 py-1 text-[12px] text-muted">{b.created_at?.slice(0, 10)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
            {!eraseRows.length && !eraseBuyers.length ? <div className="mt-1 text-[12px] text-muted">Nie je čo mazať — osoba je v suppression a nebude oslovená.</div> : null}
            <div className="mt-2 flex items-center gap-2">
              <button onClick={() => void erase()} disabled={!eraseCount} className="rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-cream disabled:opacity-40">Vymazať vybrané ({eraseCount})</button>
              {eraseRows.length >= 300 ? <span className="text-[11px] text-muted">Zobrazených prvých 300 — zúž žiadosť o k.ú. alebo LV.</span> : null}
            </div>
          </div>
        ) : null}
      </Card>

      {isAdmin ? (
        <Card className="p-4">
          <SectionHeader title="Právo na prístup (čl. 15) — čo o osobe evidujeme" />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input value={lookupName} onChange={(e) => setLookupName(e.target.value)} placeholder="Meno osoby" className="min-w-0 flex-1 rounded-md border border-line bg-paper px-2 py-2 text-sm text-fg" />
            <button onClick={() => void doLookup()} className="rounded-md border border-line px-3 py-2 text-sm text-fg hover:border-ink">Vyhľadať</button>
          </div>
          {lookup ? (
            <div className="mt-2 text-[12px] text-muted">
              Nájdených záznamov v katastri: <b className="text-fg">{lookup.rows.length}</b> · v evidencii dopytu: <b className="text-fg">{lookup.buyers?.length ?? 0}</b>{lookup.suppressed ? " · v suppression (neoslovovať)" : ""}.
              {lookup.rows.length ? <div className="mt-1 max-h-48 overflow-auto rounded border border-line p-2 font-mono text-[11px] text-fg">{lookup.rows.map((r) => <div key={r.id}>{r.name}{r.birth_date ? ` (${r.birth_date})` : ""} · {r.dataset_id} LV{r.lv_no} · {[r.addr_obec, r.addr_cislo, r.addr_psc].filter(Boolean).join(", ")}</div>)}</div> : null}
              {lookup.buyers?.length ? <div className="mt-1 max-h-40 overflow-auto rounded border border-line p-2 font-mono text-[11px] text-fg">{lookup.buyers.map((b) => <div key={b.id}>dopyt #{b.id} · {b.name} · {b.ptype} · {b.locations || "kdekoľvek"} · {b.source === "os_tri_lipy" ? "OS TRI LIPY" : "ručne"}{b.contact ? ` · ${b.contact}` : ""} · {b.created_at?.slice(0, 10)}</div>)}</div> : null}
            </div>
          ) : null}
        </Card>
      ) : null}

      {isAdmin ? (
        <Card className="p-4">
          <SectionHeader title={`Prístup — povolené registrácie${allow ? ` (${allow.emails.length})` : ""}`} hint="registrácia je len na pozvanie" />
          <p className="mt-1 text-[12px] text-muted">Zaregistrovať sa smú len tieto emaily. Prvý účet dostáva rolu admin — preto drž zoznam úzky.</p>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className="min-w-0 flex-1 text-sm text-muted">Email
              <input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="kolega@firma.sk" className="mt-1 w-full rounded-md border border-line bg-paper px-2 py-2 text-sm text-fg" />
            </label>
            <label className="min-w-0 flex-1 text-sm text-muted">Poznámka (nepovinné)
              <input value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder="napr. kolega – geodet" className="mt-1 w-full rounded-md border border-line bg-paper px-2 py-2 text-sm text-fg" />
            </label>
            <button onClick={() => void addAllow()} className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-cream">Pridať</button>
          </div>
          {allow && allow.emails.length ? (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-muted"><th className="px-2 py-1">Email</th><th className="px-2 py-1">Poznámka</th><th className="px-2 py-1">Pridané</th><th className="px-2 py-1"></th></tr></thead>
                <tbody className="divide-y divide-line">
                  {allow.emails.map((a: AllowedSignup) => (
                    <tr key={a.email}>
                      <td className="px-2 py-1 text-fg">{a.email}</td>
                      <td className="px-2 py-1 text-muted">{a.note ?? "—"}</td>
                      <td className="px-2 py-1 text-[11px] text-muted">{a.created_at?.slice(0, 10) ?? ""}</td>
                      <td className="px-2 py-1"><button onClick={() => void delAllow(a.email)} className="rounded-md border border-line px-2 py-0.5 text-xs text-fg hover:border-ink">Odobrať</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className="mt-2 text-sm text-muted">Zoznam je prázdny — nikto sa nemôže zaregistrovať.</div>}
        </Card>
      ) : null}

      {isAdmin && users?.access ? (
        <Card className="p-4">
          <SectionHeader title={`Používatelia a roly (${users.users.length})`} hint="nový účet je viewer — bez mien vlastníkov" />
          <p className="mt-1 text-[12px] text-muted">Po registrácii má každý rolu viewer. Mená vlastníkov uvidí až s rolou analytik, geodet, manažér alebo admin.</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-muted"><th className="px-2 py-1">Email</th><th className="px-2 py-1">Meno</th><th className="px-2 py-1">Rola</th><th className="px-2 py-1">Posledné prihlásenie</th><th className="px-2 py-1">Relácie</th><th className="px-2 py-1"></th></tr></thead>
              <tbody className="divide-y divide-line">
                {users.users.map((u: UserRow) => (
                  <tr key={u.id}>
                    <td className="px-2 py-1 text-fg">{u.email}</td>
                    <td className="px-2 py-1 text-muted">{u.name ?? "—"}</td>
                    <td className="px-2 py-1">
                      <select value={u.role} onChange={(e) => void changeRole(u, e.target.value as Role)} className="rounded-md border border-line bg-paper px-2 py-1 text-sm text-fg">
                        {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-1 text-[11px] text-muted">{u.last_login ? new Date(u.last_login).toLocaleString("sk-SK") : "—"}</td>
                    <td className="px-2 py-1 text-[11px] text-muted">{u.sessions}</td>
                    <td className="px-2 py-1"><button onClick={() => void revoke(u)} disabled={!u.sessions} className="rounded-md border border-line px-2 py-0.5 text-xs text-fg hover:border-ink disabled:opacity-40">Odhlásiť všade</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
