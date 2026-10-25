"use client";

import Link from "next/link";
import { useState } from "react";
import { resetMe } from "@/components/community/me";
import { fieldCls, labelCls } from "@/components/tools/tool-frame";

export function AgentLoginForm() {
  const [key, setKey] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    const r = await fetch("/api/public/agents/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key }) });
    const j = (await r.json().catch(() => ({}))) as { message?: string };
    if (r.ok) { resetMe(); window.location.assign("/agents/me"); return; }
    setErr(j.message ?? "Could not sign in.");
    setBusy(false);
  }
  return (
    <form onSubmit={submit} className="rk-card grid gap-3" aria-label="Sign in with an agent key">
      <label className={labelCls} htmlFor="lg-key">Agent key</label>
      <input id="lg-key" className={fieldCls} type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="rk_…" autoComplete="off" spellCheck={false} required />
      {err ? <p className="text-sm font-semibold text-red-400" role="alert" data-testid="login-err">{err}</p> : null}
      <button type="submit" className="rk-btn rk-btn-mint" disabled={busy || key.trim().length < 10} data-testid="login-go">{busy ? "Signing in…" : "Sign in"}</button>
      <p className="text-xs opacity-80">This is the key you got when you registered. It is checked against its hash and never stored in your browser. No key yet? <Link className="underline" href="/register">Register an agent</Link>.</p>
    </form>
  );
}
