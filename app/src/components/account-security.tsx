import { useEffect, useState } from "react";

// Bezpečnosť účtu (bod 29, 2026-11-11): druhý faktor pri prihlásení (TOTP — Google Authenticator, Microsoft
// Authenticator, 1Password…). Volá /api/auth (session v HttpOnly cookie), tajomstvo sa ukáže len pri zapínaní.
async function call(body: Record<string, unknown>) {
  const r = await fetch("/api/auth", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return (await r.json().catch(() => ({ ok: false }))) as { ok: boolean; enabled?: boolean; secret?: string; uri?: string; message?: string };
}

export function AccountSecurity() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { void call({ action: "2fa-status" }).then((r) => setEnabled(!!r.enabled)); }, []);
  async function start() { setMsg(null); const r = await call({ action: "2fa-setup" }); if (r.ok && r.secret && r.uri) setSetup({ secret: r.secret, uri: r.uri }); else setMsg(r.message ?? "Nepodarilo sa."); }
  async function confirm() { const r = await call({ action: "2fa-enable", otp: code }); if (r.ok) { setEnabled(true); setSetup(null); setCode(""); setMsg("Druhý faktor je zapnutý — pri ďalšom prihlásení zadáš aj kód."); } else setMsg(r.message ?? "Kód nesedí."); }
  async function disable() { const r = await call({ action: "2fa-disable", otp: code }); if (r.ok) { setEnabled(false); setCode(""); setMsg("Druhý faktor je vypnutý."); } else setMsg(r.message ?? "Kód nesedí."); }
  const inp = "w-36 rounded-md border border-line bg-paper px-2 py-1.5 text-sm tracking-[0.3em] text-fg";
  return (
    <div className="space-y-2 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-fg">Druhý faktor pri prihlásení</span>
        <span className={`rounded px-2 py-0.5 text-xs ${enabled ? "bg-green/15 text-green" : "bg-surface-2 text-muted"}`}>{enabled == null ? "…" : enabled ? "zapnutý" : "vypnutý"}</span>
      </div>
      <p className="text-xs text-muted">Okrem hesla bude appka pri prihlásení chcieť 6-miestny kód z overovacej aplikácie v telefóne. Odporúčané pre admina — appka drží mená vlastníkov.</p>
      {enabled === false && !setup ? <button onClick={() => void start()} className="rounded-md bg-ink px-3 py-1.5 text-xs font-medium text-cream max-md:py-2">Zapnúť druhý faktor</button> : null}
      {setup ? (
        <div className="space-y-2 rounded-md border border-line p-2 text-xs">
          <p>1. V overovacej aplikácii pridaj účet — na telefóne klikni na <a href={setup.uri} className="text-brand underline">tento odkaz</a>, alebo zadaj kľúč ručne:</p>
          <code className="block select-all break-all rounded bg-surface-2 px-2 py-1 text-[13px] tracking-wider">{setup.secret.replace(/(.{4})/g, "$1 ").trim()}</code>
          <p>2. Opíš 6-miestny kód, ktorý aplikácia ukáže:</p>
          <div className="flex items-center gap-2">
            <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="123456" className={inp} />
            <button onClick={() => void confirm()} disabled={code.length !== 6} className="rounded-md bg-ink px-3 py-1.5 font-medium text-cream disabled:opacity-40">Potvrdiť</button>
            <button onClick={() => { setSetup(null); setCode(""); }} className="text-muted hover:text-fg">Zrušiť</button>
          </div>
        </div>
      ) : null}
      {enabled ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="kód" className={inp} />
          <button onClick={() => void disable()} disabled={code.length !== 6} className="rounded-md border border-line px-3 py-1.5 text-fg hover:border-ink disabled:opacity-40">Vypnúť (zadaj aktuálny kód)</button>
        </div>
      ) : null}
      {msg ? <p className="text-xs text-muted">{msg}</p> : null}
    </div>
  );
}
