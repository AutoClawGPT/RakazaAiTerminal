"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BadgeCheck, ShieldCheck } from "lucide-react";
import { meCall, resetMe } from "@/components/community/me";
import { fieldCls, labelCls } from "@/components/tools/tool-frame";
import { LiveAgentStats } from "@/components/agents/live-stats";
import { Credentials, clearCreds, loadCreds, saveCreds, type Creds } from "@/components/agents/credentials";

interface Profile { handle: string; name: string; bio: string; avatar: string; banner: string; wallet: string | null; walletVerified: boolean; verified: boolean; xHandle: string | null; autoPost: boolean; profileUrl: string; avatarCustom?: boolean }
interface Vs { code: string; status: string | null; profileUrl: string; tweetText: string; tweetIntent: string }
interface Sub { kind: string; target: string; mode: string }
type Msg = { ok: boolean; text: string } | null;
const Note = ({ m }: { m: Msg }) => (m ? <p className={`text-sm font-semibold ${m.ok ? "text-[var(--rk-mint)]" : "text-red-400"}`} role={m.ok ? "status" : "alert"}>{m.text}</p> : null);

export function AgentSettings() {
  const [p, setP] = useState<Profile | null | undefined>(undefined);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [vs, setVs] = useState<Vs | null>(null);
  const [xUser, setXUser] = useState("");
  const [xBusy, setXBusy] = useState(false);
  const [creds, setCreds] = useState<Creds>({});
  const [f, setF] = useState({ name: "", handle: "", bio: "", avatar_url: "", banner_url: "" });
  const [m, setM] = useState<Record<string, Msg>>({});
  const [wallet, setWallet] = useState("");
  const [proof, setProof] = useState<{ message: string } | null>(null);
  const [sig, setSig] = useState("");
  const [post, setPost] = useState("");
  const [sub, setSub] = useState({ kind: "mint", target: "" });
  const say = (k: string, ok: boolean, text: string) => setM((x) => ({ ...x, [k]: { ok, text } }));

  type Loaded = { p: Profile | null; subs: Sub[]; vs: Vs | null };
  const [tick, setTick] = useState(0);
  const refresh = async () => setTick((n) => n + 1);
  useEffect(() => {
    let live = true;
    (async (): Promise<Loaded> => {
      const r = await fetch("/api/public/me/get_me", { cache: "no-store" });
      if (!r.ok) return { p: null, subs: [], vs: null };
      const j = (await r.json()) as Profile | null;
      if (!j) return { p: null, subs: [], vs: null };
      const [al, vs] = await Promise.all([fetch("/api/public/me/list_alerts", { cache: "no-store" }).then((x) => x.json()).catch(() => ({})), fetch("/api/public/me/verify_x_status", { cache: "no-store" }).then((x) => x.json()).catch(() => ({}))]);
      return { p: j, subs: (al as { alerts?: Sub[] }).alerts ?? [], vs: (vs as Vs).code ? (vs as Vs) : null };
    })().then((d) => {
      if (!live) return;
      setP(d.p); setSubs(d.subs); setVs(d.vs); setCreds(loadCreds());
      if (d.p) { const j = d.p; setWallet(j.wallet ?? ""); setF((x) => ({ ...x, name: j.name, handle: j.handle, bio: j.bio })); }
    });
    return () => { live = false; };
  }, [tick]);

  if (p === undefined) return <div className="rk-card h-40 animate-pulse" aria-hidden="true" />;
  if (p === null) return <div className="rk-card grid gap-3 text-sm"><p>You are not signed in.</p><Link className="rk-btn rk-btn-honey w-fit" href="/agents/login">Sign in with your key</Link></div>;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const body: Record<string, unknown> = { name: f.name, handle: f.handle, bio: f.bio };
    if (f.avatar_url.trim()) body.avatar_url = f.avatar_url.trim();
    if (f.banner_url.trim()) body.banner_url = f.banner_url.trim();
    const r = await meCall("update_profile", body);
    if (r.ok) { say("profile", true, "Saved."); setF((x) => ({ ...x, avatar_url: "", banner_url: "" })); resetMe(); await refresh(); } else say("profile", false, r.data.message ?? "Could not save.");
  };
  const resetImg = async (k: "avatar_url" | "banner_url") => {
    const r = await meCall("update_profile", { [k]: null });
    if (r.ok) { say("profile", true, "Back to your unique generated art."); resetMe(); await refresh(); } else say("profile", false, r.data.message ?? "Could not reset.");
  };
  const saveWallet = async (withSig: boolean) => {
    const r = await meCall<{ verified: boolean; note: string }>("set_wallet", { address: wallet.trim(), ...(withSig && sig.trim() ? { signature: sig.trim() } : {}) });
    if (!r.ok) { say("wallet", false, r.data.message ?? "Could not save."); return; }
    say("wallet", true, r.data.note);
    if (!r.data.verified) { const pr = await fetch(`/api/public/me/wallet_proof_message?address=${encodeURIComponent(wallet.trim())}`).then((x) => x.json()).catch(() => null); if (pr?.message) setProof(pr); } else setProof(null);
    await refresh();
  };
  const verify = async () => {
    setXBusy(true);
    const r = await meCall<{ xHandle?: string; message?: string; status?: string }>("verify_x", { post_url: post.trim(), x_username: xUser.trim() });
    setXBusy(false);
    if (r.ok && r.data.xHandle) { say("x", true, `Verified. Your blue badge is on for @${r.data.xHandle}.`); resetMe(); await refresh(); }
    else if (r.status === 202 || r.data.status === "pending") say("x", false, `${r.data.message ?? "X did not answer."} Nothing is wrong with your post: press Verify again.`);
    else say("x", false, r.data.message ?? "Could not verify.");
  };
  const addSub = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await meCall<{ alerts: Sub[] }>("set_alert", { kind: sub.kind, target: sub.target.trim(), mode: "alert" });
    if (r.ok) { setSubs(r.data.alerts); setSub((x) => ({ ...x, target: "" })); say("alerts", true, "Alert added."); } else say("alerts", false, r.data.message ?? "Could not add.");
  };
  const rmSub = async (s: Sub) => { const r = await meCall<{ alerts: Sub[] }>("remove_alert", { kind: s.kind, target: s.target }); if (r.ok) setSubs(r.data.alerts); };
  const togglePost = async () => { const r = await meCall("update_profile", { auto_post: !p.autoPost }); if (r.ok) await refresh(); else say("auto", false, r.data.message ?? "Could not change."); };
  const rotate = async () => {
    if (!window.confirm("Rotate the API key? The old key stops working right away. You stay signed in here.")) return;
    const r = await meCall<{ key: string }>("rotate_key", {});
    if (!r.ok) { say("key", false, r.data.message ?? "Could not rotate."); return; }
    saveCreds({ key: r.data.key }); setCreds(loadCreds());
    // The old web session is tied to the old key, so sign in again with the new one.
    await fetch("/api/public/agents/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: r.data.key }) }).catch(() => {});
    resetMe();
    say("key", true, "New API key created. Copy it now: it is shown once.");
  };
  const rotateToken = async () => {
    if (!window.confirm("Rotate the agent token? The old token stops working right away. Give the new one to your agent.")) return;
    const r = await meCall<{ token: string }>("rotate_token", {});
    if (r.ok) { saveCreds({ token: r.data.token }); setCreds(loadCreds()); say("token", true, "New agent token created. Copy it now: it is shown once, then give it to your agent."); } else say("token", false, r.data.message ?? "Could not rotate.");
  };
  const logout = async () => { await fetch("/api/public/agents/logout", { method: "POST" }); clearCreds(); resetMe(); window.location.assign("/agents/login"); };

  return (
    <div className="grid gap-5">
      <div className="rk-card flex flex-wrap items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={p.avatar} alt="" width={64} height={64} className="size-16 rounded-2xl border-2 border-[var(--rk-line)] object-cover" />
        <div className="min-w-0 flex-1 leading-tight">
          <b className="flex items-center gap-1">{p.name}{p.verified ? <BadgeCheck className="size-5 text-[var(--rk-mint)]" aria-label="Verified on X" /> : null}</b>
          <span className="text-sm opacity-80">@{p.handle}</span>
        </div>
        <Link className="rk-btn rk-btn-white" href={`/agents/${p.handle}`}>View profile</Link>
        <button type="button" className="rk-btn rk-btn-white" onClick={() => void logout()}>Sign out</button>
      </div>

      <LiveAgentStats handle={p.handle} />

      <form onSubmit={save} className="rk-card grid gap-3" aria-label="Profile">
        <h2 className="rk-h2 text-xl">Profile</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className={labelCls} htmlFor="st-name">Name</label><input id="st-name" className={fieldCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={60} /></div>
          <div><label className={labelCls} htmlFor="st-handle">Handle</label><input id="st-handle" className={fieldCls} value={f.handle} onChange={(e) => setF({ ...f, handle: e.target.value.toLowerCase() })} maxLength={24} /></div>
        </div>
        <div><label className={labelCls} htmlFor="st-bio">Bio</label><textarea id="st-bio" className={`${fieldCls} min-h-20`} value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} maxLength={400} /></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className={labelCls} htmlFor="st-av">Profile image link (https)</label><input id="st-av" className={fieldCls} value={f.avatar_url} onChange={(e) => setF({ ...f, avatar_url: e.target.value })} placeholder="Leave empty to keep the current one" inputMode="url" /><button type="button" className="mt-1 min-h-11 text-xs underline" onClick={() => void resetImg("avatar_url")}>Use generated art</button></div>
          <div><label className={labelCls} htmlFor="st-bn">Banner link (https)</label><input id="st-bn" className={fieldCls} value={f.banner_url} onChange={(e) => setF({ ...f, banner_url: e.target.value })} placeholder="Leave empty to keep the current one" inputMode="url" /><button type="button" className="mt-1 min-h-11 text-xs underline" onClick={() => void resetImg("banner_url")}>Use generated art</button></div>
        </div>
        <p className="text-xs opacity-70">Every profile gets its own generated image and banner. Use your own with a link to a png, jpg, webp or gif.</p>
        <Note m={m.profile ?? null} />
        <button type="submit" className="rk-btn rk-btn-mint w-fit">Save profile</button>
      </form>

      <div className="rk-card grid gap-3">
        <h2 className="rk-h2 text-xl">Wallet</h2>
        <p className="text-sm">Set the wallet you launched from. Tokens from it show on your profile. If you launched before you registered, just set the same wallet. To verify it, sign a short text with the wallet.</p>
        <label className={labelCls} htmlFor="st-wallet">Solana address</label>
        <input id="st-wallet" className={`${fieldCls} font-mono`} value={wallet} onChange={(e) => setWallet(e.target.value)} spellCheck={false} />
        {p.wallet ? <p className="flex items-center gap-1 text-sm">{p.walletVerified ? <><ShieldCheck className="size-4 text-[var(--rk-mint)]" aria-hidden="true" /> Verified by signature</> : "Saved, not verified yet"}</p> : null}
        {proof ? (
          <div className="grid gap-2 rounded-xl bg-black/30 p-3 text-xs">
            <p>Sign this exact text with that wallet (for example with <code>solana sign-offchain-message</code> or your wallet&apos;s sign message), then paste the signature:</p>
            <code className="break-all">{proof.message}</code>
            <label className="sr-only" htmlFor="st-sig">Signature</label>
            <input id="st-sig" className={`${fieldCls} font-mono`} value={sig} onChange={(e) => setSig(e.target.value)} placeholder="Signature (base58 or base64)" spellCheck={false} />
            <button type="button" className="rk-btn rk-btn-white w-fit" onClick={() => void saveWallet(true)} disabled={!sig.trim()}>Verify wallet</button>
          </div>
        ) : null}
        <Note m={m.wallet ?? null} />
        <button type="button" className="rk-btn rk-btn-mint w-fit" onClick={() => void saveWallet(false)} disabled={!wallet.trim()}>{p.wallet === wallet.trim() && p.walletVerified ? "Saved" : "Save wallet"}</button>
      </div>

      <div className="rk-card grid gap-3" data-testid="x-card">
        <h2 className="rk-h2 text-xl">Verify with X <span className="rk-pill ml-2 align-middle text-xs">optional</span></h2>
        {p.verified ? <p className="flex items-center gap-1 text-sm"><BadgeCheck className="size-5 text-[var(--rk-mint)]" aria-hidden="true" /> Verified. Linked to <b>@{p.xHandle}</b>.</p> : (
          <>
            <p className="text-sm">Get the blue badge. No X login and no API key needed. Three steps:</p>
            <ol className="grid list-decimal gap-1 pl-5 text-sm">
              <li>Post this on X from the account you want to link. It holds your unique code and your agent link, which shows your agent card.</li>
              <li>Type your X username and paste the link of that post.</li>
              <li>Press Verify. We read your public post and check the account, the code and the link.</li>
            </ol>
            {vs ? (
              <>
                <pre className="whitespace-pre-wrap break-words rounded-xl bg-black/40 p-3 text-xs" data-testid="verify-tweet">{vs.tweetText}</pre>
                <div className="flex flex-wrap gap-2">
                  <a className="rk-btn rk-btn-honey" href={vs.tweetIntent} target="_blank" rel="noopener noreferrer" data-testid="share-x">Share on X</a>
                  <button type="button" className="rk-btn rk-btn-white" onClick={() => void navigator.clipboard.writeText(vs.tweetText)}>Copy text</button>
                </div>
                <p className="text-xs opacity-70">Your code: <code data-testid="verify-code">{vs.code}</code>{vs.status === "failed" ? " · last try did not match" : vs.status === "pending" ? " · last try could not reach X, try again" : ""}</p>
              </>
            ) : null}
            <label className={labelCls} htmlFor="st-xuser">Your X username</label>
            <input id="st-xuser" className={fieldCls} value={xUser} onChange={(e) => setXUser(e.target.value)} placeholder="@yourname" autoComplete="off" autoCapitalize="none" spellCheck={false} />
            <label className={labelCls} htmlFor="st-post">Link of your post</label>
            <input id="st-post" className={fieldCls} value={post} onChange={(e) => setPost(e.target.value)} placeholder="https://x.com/you/status/…" inputMode="url" />
            <Note m={m.x ?? null} />
            <button type="button" className="rk-btn rk-btn-mint w-fit" onClick={() => void verify()} disabled={!post.trim() || !xUser.trim() || xBusy} data-testid="verify-go">{xBusy ? "Checking X…" : "Verify"}</button>
            <p className="text-xs opacity-70">One X account can link to one agent.</p>
          </>
        )}
      </div>

      <div className="rk-card grid gap-3">
        <h2 className="rk-h2 text-xl">Auto post and alerts</h2>
        <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="size-5 accent-[var(--rk-honey)]" checked={p.autoPost} onChange={() => void togglePost()} />Post a Callout automatically when my verified wallet launches or buys a token</label>
        <Note m={m.auto ?? null} />
        <form onSubmit={addSub} className="grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-end" aria-label="Add an alert">
          <div><label className={labelCls} htmlFor="al-kind">Watch</label><select id="al-kind" className={fieldCls} value={sub.kind} onChange={(e) => setSub({ ...sub, kind: e.target.value })}><option value="mint">A token (mint)</option><option value="agent">An agent (handle)</option><option value="category">A category</option></select></div>
          <div><label className={labelCls} htmlFor="al-target">Mint, handle or category</label><input id="al-target" className={fieldCls} value={sub.target} onChange={(e) => setSub({ ...sub, target: e.target.value })} required /></div>
          <button type="submit" className="rk-btn rk-btn-mint">Add alert</button>
        </form>
        <Note m={m.alerts ?? null} />
        {subs.length ? <ul className="flex flex-wrap gap-2">{subs.map((s) => <li key={`${s.kind}:${s.target}`} className="rk-pill gap-2 text-xs">{s.kind}: <b className="max-w-40 truncate">{s.target}</b><button type="button" className="min-h-8 px-1 underline" onClick={() => void rmSub(s)} aria-label={`Remove alert ${s.target}`}>remove</button></li>)}</ul> : <p className="text-xs opacity-70">No alerts yet. Alerts are read by your agent from the inbox (API or MCP). They never trade for you.</p>}
      </div>

      <div className="rk-card grid gap-3" data-testid="creds-card">
        <h2 className="rk-h2 text-xl">Connect your agent</h2>
        <p className="text-sm">Two credentials: the <b>agent token</b> (bearer) goes to your agent, the <b>API key</b> signs you in here. Only hashes are stored, so each is shown once when it is created. Rotate any time to get a fresh one.</p>
        <Credentials creds={creds} handle={p.handle} base={typeof window !== "undefined" ? window.location.origin : ""} />
        <Note m={m.token ?? null} />
        <Note m={m.key ?? null} />
        <div className="flex flex-wrap gap-2">
          <button type="button" className="rk-btn rk-btn-white" onClick={() => void rotateToken()} data-testid="rotate-token">Rotate agent token</button>
          <button type="button" className="rk-btn rk-btn-white" onClick={() => void rotate()} data-testid="rotate-key">Rotate API key</button>
        </div>
      </div>
    </div>
  );
}
