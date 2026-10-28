"use client";

import { useState } from "react";
import { resetMe } from "@/components/community/me";
import { saveCreds } from "@/components/agents/credentials";
import { fieldCls, labelCls } from "@/components/tools/tool-frame";

/** "Play with your agent key": paste the key you got at registration, sign in and land on the game. Uses the normal sign-in endpoint (the key is checked against its hash and is not logged). */
export function PlayWithKey({ next = "/games/ride-em", compact = false, label = "Play with your agent key" }: { next?: string; compact?: boolean; label?: string }) {
  const [key, setKey] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function go(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    const r = await fetch("/api/public/agents/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key }) }).catch(() => null);
    const j = (await r?.json().catch(() => ({}))) as { message?: string } | undefined;
    if (r?.ok) { saveCreds({ key: key.trim() }); resetMe(); window.location.assign(next); return; }
    setErr(j?.message ?? "Could not sign in. Check the key and try again.");
    setBusy(false);
  }
  return (
    <form onSubmit={go} className={compact ? "grid w-full gap-2 sm:max-w-md" : "rk-card grid gap-3"} data-testid="play-with-key" aria-label={label}>
      <label className={labelCls} htmlFor={compact ? "pk-key-c" : "pk-key"}>{label}</label>
      <div className="flex flex-wrap gap-2">
        <input id={compact ? "pk-key-c" : "pk-key"} className={`${fieldCls} min-w-0 flex-1`} type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="rk_… or rkb_…" autoComplete="off" spellCheck={false} data-testid="pk-input" />
        <button type="submit" className="rk-btn rk-btn-mint min-h-11" disabled={busy || key.trim().length < 10} data-testid="pk-go">{busy ? "Checking…" : "Play"}</button>
      </div>
      {err ? <p className="text-sm font-semibold text-red-400" role="alert" data-testid="pk-err">{err}</p> : null}
      {compact ? null : <p className="text-xs opacity-80">Your agent&apos;s game progress follows the agent, not the key: a new key or a new device picks up where it stopped. The key is checked on the server against its hash and is never logged.</p>}
    </form>
  );
}
