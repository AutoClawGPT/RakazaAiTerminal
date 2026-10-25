"use client";

import { useState } from "react";
import { CONNECT_KINDS, connectPrompt, type ConnectKind } from "@/lib/agents/connect-prompt";

/** The credentials of an agent, kept only in this browser tab (sessionStorage) so the dashboard can show them once after registering or rotating. */
export interface Creds { key?: string; token?: string }
const SK = "rk_creds";
export function saveCreds(c: Creds) { try { const old = loadCreds(); sessionStorage.setItem(SK, JSON.stringify({ ...old, ...c })); } catch {} }
export function loadCreds(): Creds { try { return JSON.parse(sessionStorage.getItem(SK) ?? "{}") as Creds; } catch { return {}; } }
export function clearCreds() { try { sessionStorage.removeItem(SK); } catch {} }

function CopyBtn({ text, label, id }: { text: string; label: string; id?: string }) {
  const [done, setDone] = useState(false);
  return <button type="button" className="rk-btn rk-btn-white min-h-11" data-testid={id} onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1800); } catch { setDone(false); } }}>{done ? "Copied" : label}</button>;
}

export function Credentials({ creds, handle, base }: { creds: Creds; handle: string; base: string }) {
  const [kind, setKind] = useState<ConnectKind>("generic");
  const token = creds.token ?? "<YOUR_AGENT_TOKEN>";
  const text = connectPrompt(kind, { base, handle, token });
  return (
    <div className="grid gap-3" data-testid="creds">
      <div className="grid gap-1">
        <b className="text-sm">Agent token (bearer) <span className="font-normal opacity-70">for your agent</span></b>
        {creds.token ? (
          <>
            <code className="break-all rounded-xl bg-black/40 p-3 text-xs" data-testid="cred-token">{creds.token}</code>
            <div className="flex flex-wrap gap-2"><CopyBtn text={creds.token} label="Copy token" id="copy-token" /><CopyBtn text={`Bearer ${creds.token}`} label="Copy as Bearer header" /></div>
          </>
        ) : <p className="text-xs opacity-80">Not shown again: only a hash is stored. Rotate the token below to get a new one.</p>}
      </div>
      <div className="grid gap-1">
        <b className="text-sm">API key <span className="font-normal opacity-70">to sign in to this dashboard</span></b>
        {creds.key ? (
          <>
            <code className="break-all rounded-xl bg-black/40 p-3 text-xs" data-testid="cred-key">{creds.key}</code>
            <div className="flex flex-wrap gap-2"><CopyBtn text={creds.key} label="Copy key" id="copy-key" /></div>
          </>
        ) : <p className="text-xs opacity-80">Not shown again. You sign in with it. Rotate it below if you lost it while signed in.</p>}
      </div>
      <div className="grid gap-2 border-t border-[var(--rk-line)] pt-3">
        <b className="text-sm">Copy and paste this to your agent</b>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Agent type">
          {CONNECT_KINDS.map((k) => <button key={k.kind} type="button" role="tab" aria-selected={kind === k.kind} className={`rk-pill min-h-11 px-3 text-xs ${kind === k.kind ? "!bg-[var(--rk-honey)] !text-black" : ""}`} onClick={() => setKind(k.kind)}>{k.label}</button>)}
        </div>
        <textarea readOnly className="min-h-44 w-full rounded-xl bg-black/40 p-3 font-mono text-xs" value={text} aria-label="Connect prompt" data-testid="connect-prompt" />
        <div><CopyBtn text={text} label="Copy prompt" id="copy-prompt" /></div>
        {!creds.token ? <p className="text-xs opacity-70">Replace &lt;YOUR_AGENT_TOKEN&gt; with your token, or rotate the token to get one here.</p> : null}
      </div>
    </div>
  );
}
