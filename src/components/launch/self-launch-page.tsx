"use client";
/* eslint-disable @next/next/no-img-element -- user image as a data URL, next/image cannot optimise it */
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRef, useState } from "react";
import { ExternalLink, ImagePlus, Sparkles } from "lucide-react";
import { fieldCls, labelCls } from "@/components/tools/tool-frame";
import { publicImageAction, preparePublicSelfLaunchAction, publicSelfRelayAction, publicSelfTxAction } from "@/app/(site)/self-launch/actions";
import { isSolanaAddress } from "@/lib/tools/address";
import { treasuryClash } from "@/lib/tools/splits";
import { saveImage, saveLaunch, shrinkImage } from "@/lib/me-store";
import type { LaunchPlan } from "@/lib/launch/approval";

const SelfLaunch = dynamic(() => import("./self-launch").then((m) => m.SelfLaunch), { ssr: false, loading: () => <p className="text-sm opacity-80">Loading wallet options…</p> });
const ACTIONS = { prepare: preparePublicSelfLaunchAction, tx: publicSelfTxAction, relay: publicSelfRelayAction };

type Done = { plan: LaunchPlan; sigs: { create?: string; split?: string; buy?: string }; imageUrl?: string };

export function SelfLaunchPage({ network, treasury, enabled }: { network: "devnet" | "mainnet-beta"; treasury?: string; enabled: boolean }) {
  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [twitter, setTwitter] = useState("");
  const [telegram, setTelegram] = useState("");
  const [image, setImage] = useState("");
  const [prompt, setPrompt] = useState("");
  const [imgBusy, setImgBusy] = useState(false);
  const [imgErr, setImgErr] = useState("");
  const [devSol, setDevSol] = useState("0");
  const [feeWallet, setFeeWallet] = useState("");
  const [msg, setMsg] = useState("");
  const [done, setDone] = useState<Done | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const cl = network === "devnet" ? "?cluster=devnet" : "";
  const dev = Number(devSol);
  const devOk = devSol.trim() === "" || (Number.isFinite(dev) && dev >= 0 && dev <= 50);
  const fw = feeWallet.trim();
  const clash = treasuryClash(fw, treasury);
  const fwOk = fw === "" || (isSolanaAddress(fw) && !clash);
  const ready = name.trim().length >= 1 && name.trim().length <= 32 && /^[A-Za-z0-9]{2,10}$/.test(ticker.trim()) && !!image && devOk && fwOk && !!treasury;
  const why = !name.trim() ? "Add a name." : !/^[A-Za-z0-9]{2,10}$/.test(ticker.trim()) ? "Add a ticker (2 to 10 letters or digits)." : !image ? "Add an image: upload one or generate one." : !devOk ? "The dev buy must be 0 to 50 SOL." : !fwOk ? (clash ?? "The fee wallet is not a valid Solana address.") : !treasury ? "This launchpad is not fully set up yet." : "";

  async function onFile(f?: File) {
    if (!f) return;
    setImgErr("");
    if (!/^image\//.test(f.type)) { setImgErr("Pick a PNG, JPEG or WebP picture."); return; }
    if (f.size > 12 * 1024 * 1024) { setImgErr("That file is over 12 MB. Pick a smaller picture."); return; }
    try {
      const url = URL.createObjectURL(f);
      const out = await shrinkImage(url, 640);
      URL.revokeObjectURL(url);
      setImage(out);
    } catch (e) { setImgErr(e instanceof Error ? e.message : "Could not read that image."); }
  }

  async function gen() {
    setImgBusy(true); setImgErr("");
    const r = await publicImageAction(prompt || `${name} ${description}`.trim());
    if (r.ok) {
      try { const small = await shrinkImage(r.dataUrl, 640); setImage(small); saveImage({ thumb: await shrinkImage(r.dataUrl, 140, 0.7), prompt: prompt.slice(0, 120), at: Date.now() }); }
      catch { setImage(r.dataUrl); }
    } else setImgErr(r.error);
    setImgBusy(false);
  }

  function finished(d: Done) {
    setDone(d);
    saveLaunch({ mint: d.plan.mint, name: d.plan.name, symbol: d.plan.symbol, creator: d.plan.creator, network: d.plan.network, sigs: d.sigs, at: Date.now() });
  }

  const link = "underline underline-offset-2 inline-flex items-center gap-1";
  return (
    <div className="grid gap-5" data-testid="self-launch-page">
      <div className="rk-card" data-testid="sl-what">
        <p className="rk-kicker">How it works</p>
        <ol className="mt-2 grid gap-1 text-sm">
          <li><b>1.</b> Fill in your token and add an image.</li>
          <li><b>2.</b> Connect your own wallet (Phantom or Solflare).</li>
          <li><b>3.</b> Press launch and approve 2 to 3 popups in your wallet. You pay the network fees and the optional dev buy.</li>
        </ol>
        <p className="mt-3 text-sm">You are the creator. The platform owns nothing of your token and never holds your keys. Creator fees are split <b>You 95% · Platform 5%</b> on-chain, permanently, and checked after launch.</p>
        <p className="mt-2 text-xs opacity-80">Network: <b data-testid="sl-network">{network === "devnet" ? "Solana devnet (test coins, no real money)" : "Solana mainnet"}</b>. {network === "devnet" ? <>Set your wallet to devnet and get free test SOL at <a className="underline" href="https://faucet.solana.com" target="_blank" rel="noreferrer">faucet.solana.com</a>. A launch needs about 0.05 SOL plus your dev buy.</> : "Real SOL is spent from your wallet."}</p>
        {!enabled ? <p className="mt-2 text-sm text-amber-300" role="alert">Self launch is switched off on this server right now.</p> : null}
      </div>

      <div className="rk-card grid gap-3" data-testid="sl-form">
        <p className="rk-kicker">1 · Your token</p>
        <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
          <div><label className={labelCls} htmlFor="sl-name">Name</label><input id="sl-name" className={fieldCls} maxLength={32} value={name} onChange={(e) => setName(e.target.value)} placeholder="My Cool Coin" data-testid="sl-name" /></div>
          <div><label className={labelCls} htmlFor="sl-ticker">Ticker</label><input id="sl-ticker" className={`${fieldCls} uppercase`} maxLength={10} value={ticker} onChange={(e) => setTicker(e.target.value.replace(/[^A-Za-z0-9]/g, ""))} placeholder="COOL" data-testid="sl-ticker" /></div>
        </div>
        <div><label className={labelCls} htmlFor="sl-desc">Description <span className="opacity-60">({description.length}/280)</span></label><textarea id="sl-desc" className={`${fieldCls} min-h-24 py-2`} maxLength={280} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is it about?" data-testid="sl-desc" /></div>
        <details className="text-sm">
          <summary className="cursor-pointer font-semibold">Optional links</summary>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <input className={fieldCls} placeholder="https:// website" value={website} onChange={(e) => setWebsite(e.target.value.trim())} aria-label="Website" />
            <input className={fieldCls} placeholder="https:// x.com/…" value={twitter} onChange={(e) => setTwitter(e.target.value.trim())} aria-label="X link" />
            <input className={fieldCls} placeholder="https:// t.me/…" value={telegram} onChange={(e) => setTelegram(e.target.value.trim())} aria-label="Telegram link" />
          </div>
        </details>

        <p className="rk-kicker mt-2">2 · Image</p>
        <div className="grid gap-3 sm:grid-cols-[9rem_1fr]">
          <div className="grid aspect-square w-36 place-items-center overflow-hidden rounded-2xl border-2 border-dashed border-[var(--rk-line)]" data-testid="sl-preview">
            {image ? <img src={image} alt="Your token" className="size-full object-cover" /> : <ImagePlus className="size-8 opacity-50" aria-hidden="true" />}
          </div>
          <div className="grid content-start gap-2">
            <button type="button" className="rk-btn rk-btn-white rk-btn-sm justify-self-start" onClick={() => fileRef.current?.click()}><ImagePlus className="size-4" aria-hidden="true" /> Upload a picture</button>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" tabIndex={-1} aria-label="Upload a token image" data-testid="sl-file" onChange={(e) => void onFile(e.target.files?.[0])} />
            <div className="flex flex-wrap gap-2">
              <input className={`${fieldCls} flex-1`} placeholder="…or describe the image to generate" value={prompt} maxLength={300} onChange={(e) => setPrompt(e.target.value)} aria-label="Image prompt" data-testid="sl-prompt" />
              <button type="button" className="rk-btn rk-btn-honey rk-btn-sm" disabled={imgBusy} onClick={() => void gen()} data-testid="sl-gen"><Sparkles className="size-4" aria-hidden="true" /> {imgBusy ? "Making…" : "Generate"}</button>
            </div>
            {imgErr ? <p className="text-sm text-red-400" role="alert" data-testid="sl-img-err">{imgErr}</p> : <p className="text-xs opacity-70">PNG, JPEG or WebP. It is resized in your browser and saved to IPFS.</p>}
          </div>
        </div>

        <p className="rk-kicker mt-2">3 · Money</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className={labelCls} htmlFor="sl-dev">Dev buy (SOL, optional)</label><input id="sl-dev" inputMode="decimal" className={fieldCls} value={devSol} onChange={(e) => setDevSol(e.target.value)} data-testid="sl-dev" /><p className="mt-1 text-xs opacity-70">Buys your own token in the same launch, paid from your wallet. 0 means none.</p></div>
          <div><label className={labelCls} htmlFor="sl-fee">Fee wallet (optional)</label><input id="sl-fee" className={`${fieldCls} font-mono`} value={feeWallet} onChange={(e) => setFeeWallet(e.target.value)} spellCheck={false} autoComplete="off" placeholder="Defaults to the wallet you connect" data-testid="sl-fee" /><p className="mt-1 text-xs opacity-70">Where your 95% of creator fees go.</p></div>
        </div>
        {clash ? <p className="text-sm text-amber-300" role="alert" data-testid="sl-clash">{clash}</p> : null}
        <p className="text-sm" data-testid="sl-split">Fee split: <b>You 95% · Platform 5%</b>. Set on-chain, cannot be changed.</p>
      </div>

      <div className="rk-card grid gap-3" data-testid="sl-launch">
        <p className="rk-kicker">4 · Connect your wallet and launch</p>
        <SelfLaunch
          name={name.trim()} ticker={ticker.trim()} description={description.trim()} image={image}
          links={{ website: website || undefined, twitter: twitter || undefined, telegram: telegram || undefined }}
          feeWallet={fw} devBuySol={devOk ? dev || 0 : 0} ready={ready} blockedReason={enabled ? "" : "Self launch is switched off on this server."}
          notReadyHint={why} onUseWallet={setFeeWallet} say={setMsg} actions={ACTIONS} onDone={finished}
        />
        {msg && !done ? <p className="text-xs opacity-80" role="status">{msg}</p> : null}
      </div>

      {done ? <ResultPanel d={done} cl={cl} network={network} link={link} /> : null}

      <div className="rk-card grid gap-2" data-testid="sl-faq">
        <p className="rk-kicker">Explain it to me (FAQ)</p>
        {[
          ["Who owns the token?", "You do. Your wallet is the creator and signs everything. The platform has no admin rights, no mint authority and no way to move your token."],
          ["What does the platform get?", "5% of the creator fees, set on-chain in the same launch. You keep 95%. The split is permanent: nobody, including us, can change it later."],
          ["Who pays?", "You. The network fees, the account rent and your optional dev buy all come from your own wallet. The platform treasury pays nothing and signs nothing."],
          ["Is it safe?", "Your private key never leaves your wallet app. The server only builds the transactions, checks them, and passes your signed transaction to the network. It refuses anything that is not a pump.fun launch from your wallet."],
          ["What if a step fails?", "Your token is not lost. Press Resume and it continues from the failed step. Do not close the tab while it runs, the one-time mint key lives only in this page."],
          ["How is this different from the Launch tab?", "The Launch tab (owner dashboard) is the sponsored free launch, where the platform treasury agent wallet pays and the split is You 70% · Platform 30%. This page is you launching from your own wallet."],
        ].map(([q, a]) => (
          <details key={q} className="text-sm"><summary className="cursor-pointer font-semibold">{q}</summary><p className="mt-1 opacity-90">{a}</p></details>
        ))}
        <p className="text-xs opacity-70">Not financial advice. Launching a coin is risky. <Link href="/terms" className="underline">Terms</Link></p>
      </div>
    </div>
  );
}

function ResultPanel({ d, cl, network, link }: { d: Done; cl: string; network: string; link: string }) {
  const { plan, sigs } = d;
  const sol = (path: string) => `https://solscan.io/${path}${cl}`;
  return (
    <div className="rk-card grid gap-3 border-emerald-400" data-testid="sl-result" role="status">
      <p className="rk-kicker">Launched from your wallet</p>
      <h2 className="rk-h2 text-2xl">{plan.name} (${plan.symbol})</h2>
      <dl className="grid gap-2 text-sm">
        <div><dt className="rk-kicker">Token address (mint)</dt><dd className="break-all font-mono text-xs" data-testid="sl-mint">{plan.mint}</dd></div>
        <div><dt className="rk-kicker">Creator (your wallet)</dt><dd className="break-all font-mono text-xs" data-testid="sl-creator">{plan.creator}</dd></div>
        <div><dt className="rk-kicker">Fee split (on-chain, permanent)</dt><dd data-testid="sl-result-split">You 95% · Platform 5%</dd></div>
        <div><dt className="rk-kicker">Network</dt><dd>{network}</dd></div>
      </dl>
      <div className="flex flex-wrap gap-3 text-sm">
        <a className={link} href={sol(`token/${plan.mint}`)} target="_blank" rel="noreferrer" data-testid="sl-solscan">Token on Solscan <ExternalLink className="size-3.5" aria-hidden="true" /></a>
        <a className={link} href={sol(`account/${plan.creator}`)} target="_blank" rel="noreferrer">Your wallet on Solscan <ExternalLink className="size-3.5" aria-hidden="true" /></a>
        {sigs.create ? <a className={link} href={sol(`tx/${sigs.create}`)} target="_blank" rel="noreferrer">Create transaction <ExternalLink className="size-3.5" aria-hidden="true" /></a> : null}
        {sigs.split ? <a className={link} href={sol(`tx/${sigs.split}`)} target="_blank" rel="noreferrer">Fee split transaction <ExternalLink className="size-3.5" aria-hidden="true" /></a> : null}
        {sigs.buy ? <a className={link} href={sol(`tx/${sigs.buy}`)} target="_blank" rel="noreferrer">Dev buy transaction <ExternalLink className="size-3.5" aria-hidden="true" /></a> : null}
        <a className={link} href={`https://pump.fun/coin/${plan.mint}`} target="_blank" rel="noreferrer" data-testid="sl-pumpfun">pump.fun page <ExternalLink className="size-3.5" aria-hidden="true" /></a>
      </div>
      {network === "devnet" ? <p className="text-xs opacity-70">This is a devnet test coin: pump.fun&apos;s website only lists mainnet coins, so use Solscan to see it. It also shows up in <Link href="/studio/me" className="underline">My studio</Link> on this device.</p> : <p className="text-xs opacity-70">It is also saved in <Link href="/studio/me" className="underline">My studio</Link> on this device.</p>}
    </div>
  );
}
