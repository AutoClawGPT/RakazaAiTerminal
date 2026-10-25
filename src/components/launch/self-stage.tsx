"use client";
/* eslint-disable @next/next/no-img-element -- the token image is a data URL from the browser, next/image cannot optimise it */
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Keypair, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import { Download, ExternalLink, ImagePlus, KeyRound } from "lucide-react";
import { fieldCls, labelCls } from "@/components/tools/tool-frame";
import type { StageCtx } from "@/components/launch/launch-flow";
import { publicPrepareAction, publicSelfRelayAction, publicSelfTxAction } from "@/app/(site)/self-launch/actions";
import { saveLaunch, shrinkImage } from "@/lib/me-store";
import type { LaunchPlan } from "@/lib/launch/approval";
import type { Breakdown } from "@/lib/launch/self-launch";

const VanityTool = dynamic(() => import("@/components/tools/vanity-tool").then((m) => m.VanityTool), { ssr: false, loading: () => <p className="text-sm opacity-80">Loading the grinder…</p> });

export interface StageWallet { address: string; signTransaction?: (tx: VersionedTransaction) => Promise<VersionedTransaction> }

type Quote = { plan: LaunchPlan; ticket: string; breakdown: Breakdown; simNote: string };
type Sigs = { create?: string; buy?: string };
type Done = { plan: LaunchPlan; sigs: Sigs; creatorOnChain?: string; serviceFeePaid?: number };

const TRANSIENT = /fetch failed|timed? ?out|429|503|ECONNRESET|socket hang up|network|busy/i;
async function withRetry<T extends { ok: boolean }>(fn: () => Promise<T>, errOf: (r: T) => string): Promise<T> {
  let last: T | undefined;
  for (let i = 0; i < 3; i++) {
    try { last = await fn(); if (last.ok || !TRANSIENT.test(errOf(last))) return last; } catch (e) { if (i === 2) throw e; }
    await new Promise((res) => setTimeout(res, 1200 * (i + 1)));
  }
  return last as T;
}
const b64ToBytes = (b: string) => Uint8Array.from(atob(b), (c) => c.charCodeAt(0));
const bytesToB64 = (u: Uint8Array) => { let s = ""; for (const b of u) s += String.fromCharCode(b); return btoa(s); };
const sol = (l: number) => (l / 1e9).toFixed(l >= 1e7 ? 4 : 5);

/** Plain-words version of a wallet or network failure. */
function friendly(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e ?? "");
  if (/reject|denied|cancel|declin/i.test(m)) return "You declined the request in your wallet. Nothing was sent. Press the button again when you are ready.";
  if (/blockhash|expired/i.test(m)) return "The transaction took too long and expired. Nothing was charged. Press the button again.";
  return m || "Something went wrong. Nothing was sent.";
}

/**
 * Self launch, after the shared agent pipeline: your options, the vanity address, a cost quote, an explicit confirm, then your own wallet signs.
 * The mint key is made in this browser and never leaves it. The platform never signs.
 */
export function SelfStage({ ctx, wallet, enabled }: { ctx: StageCtx; wallet: StageWallet | null; enabled: boolean }) {
  const { draft, pinned, image, api, network, setStep, setErr, setKit, setLocked } = ctx;
  const [name, setName] = useState(draft.name);
  const [ticker, setTicker] = useState(draft.ticker);
  const [description, setDescription] = useState(draft.description);
  const [website, setWebsite] = useState(""); const [twitter, setTwitter] = useState(""); const [telegram, setTelegram] = useState("");
  const [dirty, setDirty] = useState(!pinned);
  const [imgErr, setImgErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [devSol, setDevSol] = useState("0");
  const [mintKp, setMintKp] = useState<Keypair>(() => Keypair.generate());
  const [vanity, setVanity] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stageErr, setStageErr] = useState("");
  const [created, setCreated] = useState<{ sig: string; creatorOnChain?: string; serviceFeePaid?: number } | null>(null);
    const [buyFailed, setBuyFailed] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const keyRef = useRef<HTMLInputElement>(null);

  const mintAddr = mintKp.publicKey.toBase58();
  const addr = wallet?.address ?? "";
  const dev = Number(devSol);
  const devOk = devSol.trim() === "" || (Number.isFinite(dev) && dev >= 0 && dev <= 50);
  const fieldsOk = name.trim().length >= 1 && name.trim().length <= 32 && /^[A-Za-z0-9]{2,10}$/.test(ticker.trim());
  const expiresAt = quote?.breakdown.quoteExpiresAt ?? 0;
  const left = Math.max(0, Math.ceil((expiresAt - now) / 1000));
  const expired = !!quote && left <= 0;
  const cl = network === "devnet" ? "?cluster=devnet" : "";

  useEffect(() => { if (!quote || done) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [quote, done]);
  useEffect(() => { setKit({ groundMint: vanity ? mintAddr : null }); }, [vanity, mintAddr, setKit]);
  useEffect(() => {
    if (!busy) return;
    const f = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", f);
    return () => window.removeEventListener("beforeunload", f);
  }, [busy]);

  const invalidate = useCallback(() => { setQuote(null); setConfirmed(false); setStageErr(""); }, []);
  const edit = (fn: () => void) => { fn(); setDirty(true); invalidate(); };

  async function onFile(f?: File) {
    if (!f) return;
    setImgErr("");
    if (!/^image\//.test(f.type)) { setImgErr("Pick a PNG, JPEG or WebP picture."); return; }
    if (f.size > 12 * 1024 * 1024) { setImgErr("That file is over 12 MB. Pick a smaller picture."); return; }
    try {
      const url = URL.createObjectURL(f);
      const out = await shrinkImage(url, 640);
      URL.revokeObjectURL(url);
      ctx.setImage(out); setDirty(true); invalidate();
    } catch (e) { setImgErr(e instanceof Error ? e.message : "Could not read that image."); }
  }

  async function save() {
    if (!fieldsOk) { setStageErr("Check the name (1 to 32 characters) and the ticker (2 to 10 letters or digits)."); return; }
    if (!image) { setStageErr("Upload a picture first: the image allowance for generation may be used up."); return; }
    setSaving(true); setStageErr(""); setStep("pin", "run", "Uploading your changes to IPFS…");
    const links = { website: website || undefined, twitter: twitter || undefined, telegram: telegram || undefined };
    const r = await api.pin({ name: name.trim(), ticker: ticker.trim().toUpperCase(), description: description.trim(), imageDataUrl: image, links });
    if (!r.ok) { setStep("pin", "fail", r.error); setStageErr(r.error); setSaving(false); return; }
    ctx.setPinned({ imageUrl: r.imageUrl, uri: r.uri });
    ctx.setDraft({ ...draft, name: name.trim(), ticker: ticker.trim().toUpperCase(), description: description.trim() });
    setStep("pin", "done", r.uri); setErr(""); setDirty(false); setSaving(false);
  }

  async function readKey(f?: File) {
    if (!f) return;
    try {
      const a = JSON.parse(await f.text());
      if (!Array.isArray(a) || a.length !== 64) throw new Error("bad");
      const kp = Keypair.fromSecretKey(Uint8Array.from(a));
      setMintKp(kp); setVanity(true); invalidate();
    } catch { setStageErr("That file is not a 64-number keypair JSON (the kind the grinder writes)."); }
  }
  function fromGrinder(_addr: string, secret: string) {
    try { setMintKp(Keypair.fromSecretKey(bs58.decode(secret))); setVanity(true); invalidate(); } catch { setStageErr("The ground key could not be read. Grind again."); }
  }
  function fresh() { setMintKp(Keypair.generate()); setVanity(false); invalidate(); }
  function downloadKey() {
    const blob = new Blob([JSON.stringify(Array.from(mintKp.secretKey))], { type: "application/json" });
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = u; a.download = `mint-${mintAddr}.json`; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 2000);
  }

  async function getQuote() {
    if (!wallet || !pinned) return;
    setQuoting(true); setStageErr(""); setErr(""); setConfirmed(false); setQuote(null);
    setStep("quote", "run", "Quoting the price and dry-running the launch…");
    try {
      const r = await withRetry(() => publicPrepareAction({ name: name.trim(), ticker: ticker.trim(), uri: pinned.uri, wallet: addr, mint: mintAddr, devBuySol: dev || 0 }), (x) => (x.ok ? "" : x.error));
      if (!r.ok) { setStep("quote", "fail", r.error); setStageErr(r.error); setQuoting(false); return; }
      setQuote({ plan: r.plan, ticket: r.ticket, breakdown: r.breakdown, simNote: r.simNote }); setNow(Date.now());
      setStep("quote", "done", `${r.simNote} Total about ${sol(r.breakdown.totalLamports)} SOL.`);
      setStep("launch", "idle", "Ready: confirm the cost below, then approve in your wallet.");
      setKit({ dryRunOk: true, splitChecked: true, mintSealed: true });
    } catch (e) { const m = friendly(e); setStep("quote", "fail", m); setStageErr(m); }
    setQuoting(false);
  }

  async function signAndSend(plan: LaunchPlan, ticket: string, step: "create" | "buy") {
    if (!wallet?.signTransaction) throw new Error("Your wallet cannot sign transactions. Connect Phantom or Solflare.");
    const t = await withRetry(() => publicSelfTxAction(plan, ticket, step), (x) => (x.ok ? "" : x.error));
    if (!t.ok) throw new Error(t.error);
    const tx = VersionedTransaction.deserialize(b64ToBytes(t.tx));
    if (step === "create") tx.sign([mintKp]); // the mint signs first, then your wallet
    const signed = await wallet.signTransaction(tx);
    const r = await publicSelfRelayAction(plan, ticket, step, bytesToB64(signed.serialize()));
    if (!r.ok) throw new Error(r.error);
    return r;
  }

  async function launch() {
    if (!quote || !wallet) return;
    setBusy(true); setLocked(true); setStageErr(""); setErr("");
    setStep("launch", "run", "Waiting for your wallet…");
    let r: Awaited<ReturnType<typeof signAndSend>>;
    try { r = await signAndSend(quote.plan, quote.ticket, "create"); }
    catch (e) { const m = friendly(e); setStep("launch", "fail", m); setStageErr(`${m} If the token shows up on Solscan, it went through.`); setBusy(false); setLocked(false); return; }
    setCreated({ sig: r.sig, creatorOnChain: r.creatorOnChain, serviceFeePaid: r.serviceFeePaid });
    const sigs: Sigs = { create: r.sig };
    if (quote.plan.devBuySol > 0) {
      setStep("launch", "run", "Token created. Now the dev buy: approve it in your wallet…");
      try { const b = await signAndSend(quote.plan, quote.ticket, "buy"); sigs.buy = b.sig; }
      catch (e) { setBuyFailed(true); setStageErr(`The token exists, but the dev buy did not go through: ${friendly(e)} Press Retry dev buy.`); }
    }
    finish(quote.plan, sigs, r.creatorOnChain, r.serviceFeePaid);
    setBusy(false); setLocked(false);
  }

  function finish(plan: LaunchPlan, sigs: Sigs, creatorOnChain?: string, serviceFeePaid?: number) {
    setDone({ plan, sigs, creatorOnChain, serviceFeePaid });
    setStep("launch", sigs.buy || plan.devBuySol <= 0 ? "done" : "fail", sigs.buy || plan.devBuySol <= 0 ? "Live. You keep 100% of the creator fees." : "Token live. The dev buy needs a retry.");
    saveLaunch({ mint: plan.mint, name: plan.name, symbol: plan.symbol, creator: plan.creator, network: plan.network, sigs, at: Date.now() });
  }

  async function retryBuy() {
    if (!quote || !done) return;
    setBusy(true); setLocked(true); setStageErr("");
    try { const b = await signAndSend(quote.plan, quote.ticket, "buy"); setBuyFailed(false); finish(quote.plan, { ...done.sigs, buy: b.sig }, done.creatorOnChain, done.serviceFeePaid); }
    catch (e) { setStageErr(`The dev buy did not go through: ${friendly(e)}`); }
    setBusy(false); setLocked(false);
  }

  const b = quote?.breakdown;
  const why = !enabled ? "Self launch is switched off on this server."
    : !wallet ? "Connect your wallet first."
    : !fieldsOk ? "Check the name and the ticker."
    : !image ? "Add an image: upload your own picture."
    : dirty ? "Press Save changes to IPFS first."
    : !devOk ? "The dev buy must be 0 to 50 SOL." : "";
  const link = "underline underline-offset-2 inline-flex items-center gap-1";
  const sc = (path: string) => `https://solscan.io/${path}${cl}`;

  if (done) {
    const c = done.plan;
    const verified = done.creatorOnChain ? done.creatorOnChain === c.creator : null;
    return (
      <div className="grid gap-3 rounded-2xl border-2 border-emerald-400 p-4" data-testid="sl-result" role="status">
        <p className="rk-kicker">Launched from your wallet</p>
        <h3 className="rk-h2 text-2xl">{c.name} (${c.symbol})</h3>
        <dl className="grid gap-2 text-sm">
          <div><dt className="rk-kicker">Token address (mint)</dt><dd className="break-all font-mono text-xs" data-testid="sl-mint">{c.mint}</dd></div>
          <div><dt className="rk-kicker">Creator (your wallet)</dt><dd className="break-all font-mono text-xs" data-testid="sl-creator">{c.creator}</dd></div>
          <div><dt className="rk-kicker">Creator on-chain</dt><dd data-testid="sl-onchain">{verified === null ? "The curve was still being indexed; the create transaction is confirmed." : verified ? "Verified: the bonding curve creator is your wallet." : "Mismatch. Stop and check Solscan."}</dd></div>
          <div><dt className="rk-kicker">Creator fees</dt><dd data-testid="sl-result-split">You keep 100%. No platform shareholder, nothing to claw back.</dd></div>
          <div><dt className="rk-kicker">Service fee paid</dt><dd data-testid="sl-fee-paid">{done.serviceFeePaid != null ? `${sol(done.serviceFeePaid)} SOL` : "Included in the create transaction."}</dd></div>
          <div><dt className="rk-kicker">Network</dt><dd>{network}</dd></div>
        </dl>
        <div className="flex flex-wrap gap-3 text-sm">
          <Link className={link} href={`/token/${c.mint}`} data-testid="sl-token-page">Token page: chart &amp; trades</Link>
          <a className={link} href={sc(`token/${c.mint}`)} target="_blank" rel="noreferrer" data-testid="sl-solscan">Token on Solscan <ExternalLink className="size-3.5" aria-hidden="true" /></a>
          <a className={link} href={sc(`account/${c.creator}`)} target="_blank" rel="noreferrer">Your wallet on Solscan <ExternalLink className="size-3.5" aria-hidden="true" /></a>
          {done.sigs.create ? <a className={link} href={sc(`tx/${done.sigs.create}`)} target="_blank" rel="noreferrer">Create transaction <ExternalLink className="size-3.5" aria-hidden="true" /></a> : null}
          {done.sigs.buy ? <a className={link} href={sc(`tx/${done.sigs.buy}`)} target="_blank" rel="noreferrer">Dev buy transaction <ExternalLink className="size-3.5" aria-hidden="true" /></a> : null}
          <a className={link} href={`https://pump.fun/coin/${c.mint}`} target="_blank" rel="noreferrer" data-testid="sl-pumpfun">pump.fun page <ExternalLink className="size-3.5" aria-hidden="true" /></a>
        </div>
        {buyFailed ? <div className="grid gap-2"><p className="text-sm text-amber-300" role="alert">{stageErr}</p><button type="button" className="rk-btn rk-btn-honey justify-self-start" disabled={busy} onClick={() => void retryBuy()} data-testid="sl-retry-buy">{busy ? "Waiting for your wallet…" : "Retry dev buy"}</button></div> : null}
        {vanity ? <p className="text-xs opacity-80">You used a vanity address: keep the mint key backup file safe.</p> : null}
        <p className="text-xs opacity-70">{network === "devnet" ? "This is a devnet test coin: pump.fun's website only lists mainnet coins, so use Solscan. " : ""}It is saved in <Link href="/studio/me" className="underline">My studio</Link> on this device. Claim creator fees on pump.fun with this wallet.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 rounded-2xl border border-white/15 p-3" data-testid="self-stage">
      <p className="rk-kicker">Your launch · options</p>
      <div className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
          <div><label className={labelCls} htmlFor="sl-name">Name</label><input id="sl-name" className={fieldCls} maxLength={32} value={name} onChange={(e) => edit(() => setName(e.target.value))} data-testid="sl-name" /></div>
          <div><label className={labelCls} htmlFor="sl-ticker">Ticker</label><input id="sl-ticker" className={`${fieldCls} uppercase`} maxLength={10} value={ticker} onChange={(e) => edit(() => setTicker(e.target.value.replace(/[^A-Za-z0-9]/g, "")))} data-testid="sl-ticker" /></div>
        </div>
        <div><label className={labelCls} htmlFor="sl-desc">Description <span className="opacity-60">({description.length}/280)</span></label><textarea id="sl-desc" className={`${fieldCls} min-h-20 py-2`} maxLength={280} value={description} onChange={(e) => edit(() => setDescription(e.target.value))} data-testid="sl-desc" /></div>
        <details className="text-sm">
          <summary className="cursor-pointer font-semibold">Optional links</summary>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <input className={fieldCls} placeholder="https:// website" value={website} onChange={(e) => edit(() => setWebsite(e.target.value.trim()))} aria-label="Website" />
            <input className={fieldCls} placeholder="https:// x.com/…" value={twitter} onChange={(e) => edit(() => setTwitter(e.target.value.trim()))} aria-label="X link" />
            <input className={fieldCls} placeholder="https:// t.me/…" value={telegram} onChange={(e) => edit(() => setTelegram(e.target.value.trim()))} aria-label="Telegram link" />
          </div>
        </details>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="rk-btn rk-btn-white rk-btn-sm" onClick={() => fileRef.current?.click()}><ImagePlus className="size-4" aria-hidden="true" /> Upload my own picture</button>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" tabIndex={-1} aria-label="Upload a token image" data-testid="sl-file" onChange={(e) => void onFile(e.target.files?.[0])} />
          {image ? <img src={image} alt="Your token" className="size-16 rounded-xl border border-white/20 object-cover" /> : <span className="text-xs text-amber-300">No image yet. Upload one.</span>}
          <button type="button" className="rk-btn rk-btn-honey rk-btn-sm" disabled={saving || !dirty || !enabled} onClick={() => void save()} data-testid="sl-save">{saving ? "Uploading…" : dirty ? "Save changes to IPFS" : "Saved to IPFS"}</button>
        </div>
        {imgErr ? <p className="text-sm text-red-400" role="alert">{imgErr}</p> : <p className="text-xs opacity-70">Edit anything River wrote. PNG, JPEG or WebP, resized in your browser, stored on IPFS.</p>}
      </div>

      <div className="grid gap-2 rounded-xl bg-white/5 p-3" data-testid="sl-mint-box">
        <p className="rk-kicker flex items-center gap-1"><KeyRound className="size-3.5" aria-hidden="true" /> Token address (mint)</p>
        <p className="break-all font-mono text-xs" data-testid="sl-mint-addr">{mintAddr}</p>
        <p className="text-xs opacity-80">{vanity ? "A vanity address. Download the key backup before you launch." : "A fresh random address, made in this browser. The key never leaves it."}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="rk-btn rk-btn-white rk-btn-sm" onClick={downloadKey} data-testid="sl-key-download"><Download className="size-4" aria-hidden="true" /> Download mint key backup</button>
          {vanity ? <button type="button" className="rk-btn rk-btn-white rk-btn-sm" onClick={fresh}>Use a random address instead</button> : null}
        </div>
        <details className="text-sm" data-testid="sl-vanity">
          <summary className="cursor-pointer font-semibold">Optional: vanity address (for example ending in pump)</summary>
          <p className="mt-1 text-xs opacity-80">Grind one right here in your browser, or pick a key file made with <code>node cli/rakaza-grind.mjs --end pump --count 1 --out ./keys</code>. The key never leaves your browser.</p>
          <button type="button" className="rk-btn rk-btn-white rk-btn-sm mt-2" onClick={() => keyRef.current?.click()}>Choose a key file</button>
          <input ref={keyRef} type="file" accept="application/json,.json" className="sr-only" tabIndex={-1} aria-label="Vanity key file" data-testid="sl-ground" onChange={(e) => void readKey(e.target.files?.[0])} />
          <div className="mt-3"><VanityTool onFound={fromGrinder} /></div>
        </details>
      </div>

      <div className="grid gap-1 sm:max-w-xs">
        <label className={labelCls} htmlFor="sl-dev">Dev buy (SOL, optional)</label>
        <input id="sl-dev" inputMode="decimal" className={fieldCls} value={devSol} onChange={(e) => { setDevSol(e.target.value); invalidate(); }} data-testid="sl-dev" />
        <p className="text-xs opacity-70">Buys your own token right after it is created, paid from your wallet. 0 means none.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="rk-btn rk-btn-mint" disabled={!!why || quoting || busy} onClick={() => void getQuote()} data-testid="sl-quote">
          {quoting ? "Quoting…" : quote ? (expired ? "Refresh my quote" : "Re-quote") : "Get my quote"}
        </button>
        {why ? <span className="text-xs text-amber-300" data-testid="sl-why">{why}</span> : null}
      </div>
      {stageErr && !buyFailed ? <p className="text-sm text-red-400" role="alert" data-testid="sl-err">{stageErr}</p> : null}

      {quote && b ? (
        <div className="grid gap-3 rounded-xl border border-white/20 p-3" data-testid="sl-breakdown">
          <p className="rk-kicker">Cost breakdown · you pay all of it from your wallet</p>
          <table className="w-full text-sm">
            <tbody>
              <tr><td className="py-0.5">pump.fun launch cost + network fees{b.estimated ? " (estimate)" : ""}</td><td className="text-right font-mono" data-testid="sl-b-pump">{sol(b.pumpAndNetworkLamports)} SOL</td></tr>
              <tr><td className="py-0.5">Service fee (flat ${b.serviceFeeUsd.toFixed(2)}){b.feeSource === "fallback" ? " · fixed SOL amount, the live price was unavailable" : b.solUsd ? ` · at $${b.solUsd.toFixed(2)} per SOL` : ""}</td><td className="text-right font-mono" data-testid="sl-b-fee">{sol(b.serviceFeeLamports)} SOL</td></tr>
              {b.devBuyLamports > 0 ? <tr><td className="py-0.5">Dev buy</td><td className="text-right font-mono">{sol(b.devBuyLamports)} SOL</td></tr> : null}
              {b.bufferLamports > 0 ? <tr><td className="py-0.5">Buffer for the dev buy fees</td><td className="text-right font-mono">{sol(b.bufferLamports)} SOL</td></tr> : null}
              <tr className="border-t border-white/20 font-bold"><td className="py-1">Total</td><td className="text-right font-mono" data-testid="sl-b-total">{sol(b.totalLamports)} SOL</td></tr>
              <tr className="opacity-80"><td className="py-0.5">Your wallet balance</td><td className="text-right font-mono">{sol(b.balanceLamports)} SOL</td></tr>
            </tbody>
          </table>
          <p className="text-xs" data-testid="sl-quote-timer">{expired ? "This quote expired. Press Refresh my quote." : `Quote valid for ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}.`} {quote.simNote}</p>
          <label className="flex min-h-11 items-start gap-2 text-sm"><input type="checkbox" className="mt-1 h-5 w-5" data-testid="sl-confirm" checked={confirmed} disabled={expired} onChange={(e) => setConfirmed(e.target.checked)} /><span>I confirm: my wallet is the creator and keeps 100% of the creator fees, and I pay about {sol(b.totalLamports)} SOL in total, including the flat service fee of {sol(b.serviceFeeLamports)} SOL.</span></label>
          <button type="button" className="rk-btn rk-btn-mint" disabled={!confirmed || expired || busy || !enabled} onClick={() => void launch()} data-testid="sl-launch">{busy ? "Waiting for your wallet…" : "Approve and launch from my wallet"}</button>
          <p className="text-xs opacity-70">Your wallet shows what it signs. The service fee and the token creation are one transaction: if the token is not created, the fee is not charged.</p>
        </div>
      ) : null}
      {created && !done ? <p className="text-xs break-all" role="status">Created: <span className="font-mono">{created.sig}</span></p> : null}
    </div>
  );
}
