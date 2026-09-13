import { useCallback, useEffect, useRef, useState } from "react";
import { listDocuments, uploadDocument, getDocumentData, deleteDocument, DOC_KINDS, type DocRow } from "../lib/api/kataster.functions";
import { canRunPipeline, type Role } from "../lib/domain";

const KIND_LABEL: Record<string, string> = { vypis: "Výpis", GP: "Geom. plán", ZPMZ: "ZPMZ", zmluva: "Zmluva", foto: "Foto", ine: "Iné" };
const MAX_BYTES = 9_500_000; // ~9,5 MB (server strop ~9,7 MB base64)
const fmtSize = (n: number | null) => (n == null ? "" : n < 1024 ? `${n} B` : n < 1_048_576 ? `${Math.round(n / 1024)} kB` : `${(n / 1_048_576).toFixed(1)} MB`);

// Reusable panel dokumentov — na spise (caseId), výpise LV alebo parcele (subjectType+subjectRef).
export function DocumentsPanel({ datasetId, subjectType, subjectRef, caseId, role, compact }: {
  datasetId: string; subjectType?: "lv" | "parcel" | "owner" | "case"; subjectRef?: string; caseId?: number; role: Role; compact?: boolean;
}) {
  const [docs, setDocs] = useState<DocRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [kind, setKind] = useState<(typeof DOC_KINDS)[number]>("ine");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const canEdit = canRunPipeline(role);

  const refresh = useCallback(() => {
    listDocuments({ data: { datasetId, caseId, subjectType: caseId ? undefined : subjectType, subjectRef: caseId ? undefined : subjectRef } })
      .then((r) => setDocs(r)).catch(() => setDocs([]));
  }, [datasetId, caseId, subjectType, subjectRef]);
  useEffect(() => { refresh(); }, [refresh]);

  async function onFile(file: File) {
    if (file.size > MAX_BYTES) { setMsg(`Súbor je priveľký (${fmtSize(file.size)}, max ~9,5 MB).`); return; }
    setBusy(true); setMsg(null);
    try {
      const dataUrl: string = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = rej; fr.readAsDataURL(file); });
      const b64 = dataUrl.split(",")[1] ?? "";
      const r = await uploadDocument({ data: { datasetId, caseId, subjectType, subjectRef, name: file.name.slice(0, 200), kind, mime: file.type || "application/octet-stream", sizeBytes: file.size, dataBase64: b64, role } });
      setMsg(r.ok ? `Nahraté: ${file.name}` : (r.message ?? "Nahranie zlyhalo."));
      if (r.ok) refresh();
    } catch { setMsg("Nahranie zlyhalo."); } finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  async function open(d: DocRow) {
    setBusy(true);
    try {
      const r = await getDocumentData({ data: { id: d.id } });
      if (!r.ok || !r.dataUrl) { setMsg("Súbor sa nepodarilo načítať."); return; }
      const a = document.createElement("a");
      a.href = r.dataUrl; a.download = r.name ?? d.name; a.rel = "noopener";
      document.body.appendChild(a); a.click(); a.remove();
    } finally { setBusy(false); }
  }

  async function remove(d: DocRow) {
    if (!window.confirm(`Zmazať dokument „${d.name}"?`)) return;
    setBusy(true);
    try { const r = await deleteDocument({ data: { id: d.id, role } }); setMsg(r.ok ? "Zmazané." : (r.message ?? "Mazanie zlyhalo.")); if (r.ok) refresh(); }
    finally { setBusy(false); }
  }

  return (
    <div>
      {canEdit ? (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <select value={kind} onChange={(e) => setKind(e.target.value as (typeof DOC_KINDS)[number])} className="rounded-md border border-line bg-paper px-2 py-1 text-xs text-fg">
            {DOC_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
          <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,application/pdf,image/*" disabled={busy}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }}
            className="text-xs text-muted file:mr-2 file:rounded-md file:border file:border-line file:bg-surface-2/40 file:px-2 file:py-1 file:text-xs file:text-fg" />
          {busy ? <span className="text-[11px] text-muted">…</span> : null}
        </div>
      ) : null}
      {msg ? <div className="mb-2 text-[11px] text-muted">{msg}</div> : null}
      {docs == null ? (
        <div className="px-1 py-1 text-sm text-muted">Načítavam dokumenty…</div>
      ) : docs.length === 0 ? (
        <div className="px-1 py-1 text-sm text-muted">{canEdit ? "Zatiaľ žiadne dokumenty — nahraj prvý." : "Žiadne dokumenty."}</div>
      ) : (
        <div className="divide-y divide-line">
          {docs.map((d) => (
            <div key={d.id} className="flex items-center gap-2 py-1.5 text-sm">
              <span className="rounded-full border border-line px-1.5 py-0.5 text-[10px] text-muted">{KIND_LABEL[d.kind] ?? d.kind}</span>
              <button onClick={() => void open(d)} disabled={busy} className="min-w-0 flex-1 truncate text-left text-fg hover:underline" title={d.name}>{d.name}</button>
              {!compact ? <span className="shrink-0 text-[11px] tabular-nums text-muted">{fmtSize(d.size_bytes)}{d.created_at ? ` · ${d.created_at.slice(0, 10)}` : ""}</span> : null}
              {canEdit ? <button onClick={() => void remove(d)} disabled={busy} className="shrink-0 text-[11px] text-muted hover:text-fg" title="Zmazať">✕</button> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
