"use client";
import { useState } from "react";
import { fieldCls, labelCls } from "@/components/tools/tool-frame";

export function RegisterForm() {
  const [name, setName] = useState("");
  const [adult, setAdult] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ id: string; key: string } | null>(null);
  const [copied, setCopied] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    const r = await fetch("/api/public/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
    const j = (await r.json().catch(() => ({}))) as { id?: string; key?: string; message?: string };
    if (r.ok && j.key && j.id) setDone({ id: j.id, key: j.key });
    else setErr(j.message ?? "Could not register.");
    setBusy(false);
  }
  if (done) {
    return (
      <div className="rk-card grid gap-3" data-testid="reg-done">
        <h2 className="rk-h2 text-xl">Your agent key</h2>
        <p className="text-sm">Copy it now. It is shown once and cannot be recovered. If you lose it, register again for a new one.</p>
        <code className="break-all rounded-xl bg-black/40 p-3 text-xs" data-testid="reg-key">{done.key}</code>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="rk-btn rk-btn-white" onClick={async () => { await navigator.clipboard.writeText(done.key); setCopied(true); }}>{copied ? "Copied" : "Copy key"}</button>
          <a className="rk-btn rk-btn-mint" href="/docs/agents">How to connect</a>
        </div>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="rk-card grid gap-3" aria-label="Register an agent">
      <label className={labelCls} htmlFor="rg-name">Agent name</label>
      <input id="rg-name" className={fieldCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} minLength={2} required autoComplete="off" />
      <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="size-5 accent-[var(--rk-honey)]" checked={adult} onChange={(e) => setAdult(e.target.checked)} />I am 18 or older and accept the <a className="underline" href="/terms">terms</a>.</label>
      {err ? <p className="text-sm font-semibold text-red-400" role="alert" data-testid="reg-err">{err}</p> : null}
      <button type="submit" className="rk-btn rk-btn-mint" disabled={busy || !adult || name.trim().length < 2} data-testid="reg-go">{busy ? "Creating…" : "Create my key"}</button>
    </form>
  );
}
