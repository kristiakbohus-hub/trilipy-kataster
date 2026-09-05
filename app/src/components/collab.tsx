import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../lib/auth-context";
import { getComments, addComment, deleteComment, isWatched, toggleWatch, getNotifications, markNotifsRead } from "../lib/api/kataster.functions";

// Zvonček notifikácií (in-app) — nové komentáre/priradenia/zmeny na sledovaných.
export function NotifBell() {
  const { token } = useAuth();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Awaited<ReturnType<typeof getNotifications>>>([]);
  const load = useCallback(() => { if (token) getNotifications({ data: { token } }).then(setRows).catch(() => {}); }, [token]);
  useEffect(() => { load(); const iv = setInterval(load, 60000); return () => clearInterval(iv); }, [load]);
  if (!token) return null;
  const unread = rows.filter((r) => !r.is_read).length;
  async function onOpen() {
    const willOpen = !open;
    setOpen(willOpen);
    if (willOpen && unread && token) { await markNotifsRead({ data: { token } }).catch(() => {}); setRows((rs) => rs.map((r) => ({ ...r, is_read: 1 }))); }
  }
  return (
    <div className="relative">
      <button onClick={onOpen} title="Notifikácie" className="relative rounded-md border border-line px-2 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-fg">
        🔔{unread ? <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-[#9c4a40] px-1 text-center text-[9px] font-bold text-white">{unread}</span> : null}
      </button>
      {open ? (
        <div className="absolute right-0 z-40 mt-1 max-h-80 w-72 overflow-y-auto rounded-lg border border-line bg-paper p-2 text-xs shadow-xl">
          {rows.length === 0 ? <div className="p-2 text-muted">Žiadne notifikácie.</div> : rows.map((n) => (
            <div key={n.id} className="border-b border-line/50 py-1.5 last:border-0">
              <div className="text-fg">{n.body}</div>
              <div className="text-[10px] text-muted">{n.created_at ? n.created_at.slice(0, 16) : ""}</div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// Watchlist tlačidlo (hviezdička) — sledovanie parcely/LV/obce; notifikácie pri zmenách/komentároch.
export function WatchButton({ subjectType, subjectId, label, className }: { subjectType: string; subjectId: string; label?: string; className?: string }) {
  const { token } = useAuth();
  const [watched, setWatched] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    if (!token) { setWatched(false); return; }
    isWatched({ data: { token, subjectType, subjectId } }).then((r) => { if (alive) setWatched(r.watched); }).catch(() => { if (alive) setWatched(false); });
    return () => { alive = false; };
  }, [token, subjectType, subjectId]);
  if (!token) return null;
  async function toggle() {
    if (!token) return;
    setBusy(true);
    try { const r = await toggleWatch({ data: { token, subjectType, subjectId, label } }); if (r.ok) setWatched(r.watched); } finally { setBusy(false); }
  }
  return (
    <button onClick={toggle} disabled={busy} title="Pridať/odobrať zo sledovaných (watchlist)"
      className={"inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs " + (watched ? "border-brand bg-brand/10 text-fg" : "border-line text-muted hover:text-fg") + (className ? " " + className : "")}>
      {watched ? "★ Sledované" : "☆ Sledovať"}
    </button>
  );
}

// Vlákno komentárov k parcele/LV — tímové poznámky.
export function CommentsPanel({ subjectType, subjectId }: { subjectType: string; subjectId: string }) {
  const { token, user } = useAuth();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof getComments>>>([]);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => { getComments({ data: { subjectType, subjectId } }).then(setRows).catch(() => {}); }, [subjectType, subjectId]);
  useEffect(() => { load(); }, [load]);
  async function send() {
    if (!token || !body.trim()) return;
    setBusy(true);
    try { const r = await addComment({ data: { token, subjectType, subjectId, body: body.trim() } }); if (r.ok) { setBody(""); load(); } } finally { setBusy(false); }
  }
  async function del(id: number) {
    if (!token) return;
    await deleteComment({ data: { token, id } }).catch(() => {});
    load();
  }
  return (
    <div className="space-y-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">💬 Komentáre ({rows.length})</div>
      {token ? (
        <div className="flex gap-1">
          <input value={body} onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
            placeholder="Napíš tímovú poznámku…" className="flex-1 rounded-md border border-line bg-paper px-2 py-1 text-xs text-fg outline-none focus:border-brand" />
          <button onClick={send} disabled={busy || !body.trim()} className="shrink-0 rounded-md bg-ink px-2.5 py-1 text-xs text-cream disabled:opacity-50">Pridať</button>
        </div>
      ) : <div className="text-[11px] text-muted">Prihlás sa pre komentovanie.</div>}
      <div className="space-y-1">
        {rows.length === 0 ? <div className="text-[11px] text-muted">Zatiaľ bez komentárov.</div> : null}
        {rows.map((c) => (
          <div key={c.id} className="rounded-md bg-surface-2/40 px-2 py-1 text-xs">
            <div className="mb-0.5 flex items-center justify-between gap-2">
              <span className="font-medium text-fg">{c.author ?? "—"}</span>
              <span className="flex items-center gap-1 text-[10px] text-muted">
                {c.created_at ? c.created_at.slice(0, 16) : ""}
                {user && (c.user_id === user.id || user.role === "admin") ? <button onClick={() => del(c.id)} title="Zmazať" className="hover:text-fg">✕</button> : null}
              </span>
            </div>
            <div className="whitespace-pre-wrap text-fg">{c.body}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
