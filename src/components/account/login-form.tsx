"use client";
import { useState } from "react";
import { fieldCls, labelCls } from "@/components/tools/tool-frame";

export function LoginForm({ next }: { next: string }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    const r = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: pw }) });
    if (r.ok) { window.location.assign(next); return; }
    const j = (await r.json().catch(() => ({}))) as { message?: string };
    setErr(j.message ?? "Could not sign in.");
    setBusy(false);
  }
  return (
    <form onSubmit={submit} className="rk-card grid gap-3" aria-label="Owner sign in">
      <label className={labelCls} htmlFor="lg-pw">Owner password</label>
      <input id="lg-pw" type="password" className={fieldCls} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" required />
      {err ? <p className="text-sm font-semibold text-red-400" role="alert" data-testid="login-err">{err}</p> : null}
      <button type="submit" className="rk-btn rk-btn-mint" disabled={busy || !pw} data-testid="login-go">{busy ? "Checking…" : "Sign in"}</button>
    </form>
  );
}
