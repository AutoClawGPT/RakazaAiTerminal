"use client";
/* eslint-disable @next/next/no-img-element -- generated data URL, next/image cannot optimise it */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mic, MicOff, SendHorizontal, Volume2, VolumeX } from "lucide-react";
import { fieldCls, labelCls, SlidePanel } from "@/components/tools/tool-frame";
import { SelfLaunch } from "@/components/launch/self-launch";
import { VanityTool } from "@/components/tools/vanity-tool";
import { useVoice } from "@/components/talk/use-voice";
import { draftAction, imageAction, launchAction, prepareLaunchAction, retrySplitAction, scanTokenAction, type PrepareOut } from "@/app/(dash)/launch/actions";
import { parseIntent } from "@/lib/launch/intent";
import { bpsToPercent, platformSplit, treasuryClash, validateSplit } from "@/lib/tools/splits";
import { simulate } from "@/lib/tools/curve";
import { buildMetadata, emptyKit } from "@/lib/tools/kit";
import { isSolanaAddress } from "@/lib/tools/address";
import type { TokenInfo } from "@/lib/launch/token-fetch";
import type { Draft } from "@/lib/launch/optimize";

type Say = { id: number; who: "me" | "her"; text: string };
type Mode = "own" | "sponsored";

const usd = (n?: number) => (n == null ? "unknown" : n >= 1000 ? `$${Math.round(n).toLocaleString()}` : `$${n.toPrecision(3)}`);

export function LaunchClient({ treasury, network, executeBlockedReason, selfBlockedReason = "" }: { treasury?: string; network: "devnet" | "mainnet-beta"; executeBlockedReason: string; selfBlockedReason?: string }) {
  const [log, setLog] = useState<Say[]>([{ id: 1, who: "her", text: "Paste a token address or tell me what to launch. I’ll scan it, rewrite it with River, make the image, and set the 70/30 split. You approve the last step." }]);
  const [input, setInput] = useState("");
  const [muted, setMuted] = useState(false);
  const [busy, setBusy] = useState("");
  const [mint, setMint] = useState("");
  const [token, setToken] = useState<TokenInfo | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [image, setImage] = useState("");
  const [imageErr, setImageErr] = useState("");
  const [err, setErr] = useState("");
  const [wallet, setWallet] = useState("");
  const [mode, setMode] = useState<Mode>("sponsored");
  const [devSol, setDevSol] = useState("0.5");
  const idRef = useRef(2);
  const busyRef = useRef(false);
  const voiceRef = useRef<ReturnType<typeof useVoice> | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [prep, setPrep] = useState<PrepareOut | null>(null);
  const [prepErr, setPrepErr] = useState("");
  const [launchMsg, setLaunchMsg] = useState("");

  const say = useCallback((text: string, who: "me" | "her" = "her") => {
    setLog((l) => [...l.slice(-30), { id: idRef.current++, who, text }]);
    if (who === "her") void voiceRef.current?.speak(text);
  }, []);

  const clash = treasuryClash(wallet, treasury);
  const split = useMemo(() => (treasury && !treasuryClash(wallet, treasury) && isSolanaAddress(wallet.trim()) ? platformSplit(wallet, treasury) : null), [treasury, wallet]);
  const splitCheck = useMemo(() => (split ? validateSplit(split) : null), [split]);
  const sim = useMemo(() => {
    const n = Number(devSol);
    return Number.isFinite(n) && n >= 0 ? simulate([{ wallet: "Dev", sol: n }]) : null;
  }, [devSol]);

  const runImage = useCallback(
    async (prompt: string) => {
      setBusy("image"); setImageErr("");
      const r = await imageAction(prompt);
      if (r.ok) { setImage(r.dataUrl); say(`Image ready in ${(r.ms / 1000).toFixed(1)} seconds.`); }
      else { setImageErr(r.error); say(`The image step failed: ${r.error}`); }
      setBusy("");
    },
    [say],
  );

  const runDraft = useCallback(
    async (t: TokenInfo) => {
      setBusy("draft");
      const r = await draftAction(t);
      if (!r.ok) { setErr(r.error); say(r.error); setBusy(""); return; }
      setDraft(r.draft);
      say(r.draft.fromRiver ? `River’s version: ${r.draft.name}, ticker ${r.draft.ticker}. Making the image now.` : "River was busy, so I used a simple template draft. Making the image now.");
      setBusy("");
      await runImage(r.draft.imagePrompt);
    },
    [say, runImage],
  );

  const runScan = useCallback(
    async (m: string) => {
      setErr(""); setBusy("scan"); setDraft(null); setImage(""); setMint(m);
      const r = await scanTokenAction(m);
      if (!r.ok) { setErr(r.error); say(r.error); setBusy(""); return; }
      setToken(r.token);
      say(`Found ${r.token.name || r.token.symbol}, market cap about ${usd(r.token.marketCapUsd)}. Rewriting it with River.`);
      setBusy("");
      await runDraft(r.token);
    },
    [say, runDraft],
  );

  const handle = useCallback(
    async (text: string) => {
      const t = text.trim().slice(0, 400);
      if (!t || busyRef.current) return;
      busyRef.current = true;
      say(t, "me");
      setInput("");
      try {
        const it = parseIntent(t);
        if (it.kind === "scan") await runScan(it.mint);
        else if (it.kind === "draft") { if (token) await runDraft(token); else say("Give me a token address first and I’ll recreate it."); }
        else if (it.kind === "image") { if (draft) await runImage(draft.imagePrompt); else say("I need a draft first. Paste a token address."); }
        else if (it.kind === "vanity") { setOpen((o) => ({ ...o, vanity: true })); say("Opening the vanity grinder. Set the letters you want and press start."); }
        else if (it.kind === "split") {
          if (it.wallet) setWallet(it.wallet);
          setOpen((o) => ({ ...o, fees: true }));
          say(it.wallet ? "Fee wallet set. You get 70 percent, the platform keeps 30, and it is permanent once launched." : "Fees are 70 percent to your wallet and 30 to the platform, permanent. Paste your fee wallet in the panel.");
        } else if (it.kind === "simulate") {
          if (it.sol != null) setDevSol(String(it.sol));
          setOpen((o) => ({ ...o, sim: true }));
          say("Simulation is open with your dev buy.");
        } else if (it.kind === "launch") {
          setOpen((o) => ({ ...o, approve: true }));
          say(`I can’t launch yet. ${executeBlockedReason} When it is on, you will approve the launch here yourself.`);
        } else {
          const res = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: [{ role: "user", content: t }] }) });
          const data = (await res.json()) as { reply?: string; message?: string };
          say(data.reply ?? data.message ?? "I didn’t get that, try again.");
        }
      } finally {
        busyRef.current = false;
      }
    },
    [say, runScan, runDraft, runImage, token, draft, executeBlockedReason],
  );

  const voice = useVoice({ onFinalText: (t) => void handle(t), muted });
  useEffect(() => {
    voiceRef.current = voice;
  }, [voice]);

  const ready = {
    scan: !!token,
    draft: !!draft,
    image: !!image,
    fees: !!splitCheck?.ok,
    sim: !!sim && sim.warnings.every((w) => w.level !== "bad"),
  };
  const allReady = Object.values(ready).every(Boolean);

  const pkg = useMemo(() => {
    if (!draft || !split) return "";
    const meta = buildMetadata({ ...emptyKit, name: draft.name, ticker: draft.ticker, description: draft.description, image: "", website: token?.links.website ?? "", twitter: token?.links.twitter ?? "", telegram: token?.links.telegram ?? "" });
    return JSON.stringify({ network, mode, sourceMint: token?.mint, metadata: meta, imageIncluded: !!image, shareholders: split.map((s) => ({ address: s.address, shareBps: s.shareBps, label: s.label })), devBuySol: Number(devSol) || 0, note: "Image is uploaded to IPFS at launch time. No keys are included." }, null, 2);
  }, [draft, split, token, image, devSol, mode, network]);

  const download = () => {
    const url = URL.createObjectURL(new Blob([pkg], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = "rakaza-launch-package.json"; a.click(); URL.revokeObjectURL(url);
  };

  const runPrepare = async () => {
    if (!draft || !image || !split) return;
    setBusy("prepare"); setPrepErr(""); setPrep(null); setLaunchMsg("");
    const r = await prepareLaunchAction({ name: draft.name, ticker: draft.ticker, description: draft.description, imageDataUrl: image, links: { website: token?.links.website, twitter: token?.links.twitter, telegram: token?.links.telegram }, feeWallet: wallet, mode: mode === "own" ? "own" : "sponsored", devBuySol: Number(devSol) || 0 });
    if (r.ok) { setPrep(r.out); say(`Launch prepared. The image and details are saved on IPFS and both transactions are built. ${r.out.simulation.note} Nothing has been sent.`); }
    else { setPrepErr(r.error); say(`I could not prepare it: ${r.error}`); }
    setBusy("");
  };
  const runLaunch = async () => {
    if (!prep) return;
    setBusy("launch"); setLaunchMsg("");
    const r = await launchAction(prep.plan, prep.ticket, prep.sealedMint);
    const msg = !r.ok ? r.error : r.result.ok ? `Launched. Create transaction ${r.result.tx1 ?? ""}, split transaction ${r.result.tx2 ?? "already set"}.${r.result.devBuy ? ` Dev buy transaction ${r.result.devBuy}.` : ""}${r.result.error ? ` Warning: ${r.result.error}` : ""}` : `${r.result.error ?? "Stopped."}`;
    setLaunchMsg(msg); say(msg); setBusy("");
  };
  const runRetry = async () => {
    if (!prep) return;
    setBusy("launch");
    const r = await retrySplitAction(prep.plan, prep.ticket);
    const msg = !r.ok ? r.error : r.result.ok ? "The 70/30 split is now set and verified on-chain." : (r.result.error ?? "Split still failing.");
    setLaunchMsg(msg); say(msg); setBusy("");
  };

  const chip = (ok: boolean) => <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${ok ? "bg-emerald-400/90 text-black" : "bg-white/15"}`}>{ok ? "done" : "to do"}</span>;
  const panel = (id: string, title: string, hint: string, ok: boolean, body: React.ReactNode) => (
    <div data-panel={id}>
      <SlidePanel key={`${id}-${open[id] ? 1 : 0}`} title={title} hint={hint} defaultOpen={!!open[id] || (id === "scan")}>
        <div className="mb-3">{chip(ok)}</div>
        {body}
      </SlidePanel>
    </div>
  );

  return (
    <div className="grid gap-5">
      <section className="rk-card" aria-label="Talk to Rakaza">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="rk-kicker">Rakaza runs this tab</p>
          <div className="flex gap-2">
            <button type="button" className="rk-btn rk-btn-white rk-btn-sm" aria-pressed={muted} onClick={() => { setMuted((m) => !m); voice.stopSpeaking(); }} aria-label={muted ? "Unmute Rakaza" : "Mute Rakaza"}>{muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}</button>
            <button type="button" className={`rk-btn rk-btn-sm ${voice.listening ? "rk-btn-honey" : "rk-btn-white"}`} aria-pressed={voice.listening} data-testid="mic" onClick={() => (voice.listening ? voice.stopListening() : void voice.startListening())} aria-label={voice.listening ? "Stop listening" : "Talk to Rakaza"}>{voice.listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}<span className="ml-1">{voice.listening ? "Listening" : "Talk"}</span></button>
          </div>
        </div>
        <ul className="grid max-h-56 gap-2 overflow-y-auto pr-1 text-sm" aria-live="polite" data-testid="launch-log">
          {log.map((m) => (
            <li key={m.id} className={m.who === "me" ? "justify-self-end rounded-2xl bg-white/15 px-3 py-2" : "justify-self-start rounded-2xl bg-[var(--rk-honey)]/90 px-3 py-2 text-black"}>{m.text}</li>
          ))}
        </ul>
        {voice.error ? <p className="mt-2 text-xs text-amber-300" role="status">{voice.error}</p> : null}
        {voice.interim ? <p className="mt-2 text-xs opacity-80">{voice.interim}</p> : null}
        <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); void handle(input); }}>
          <label className="sr-only" htmlFor="l-say">Message to Rakaza</label>
          <input id="l-say" className={`${fieldCls} flex-1`} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Paste a token address, or say “launch”…" autoComplete="off" spellCheck={false} />
          <button type="submit" className="rk-btn rk-btn-mint" aria-label="Send" disabled={!!busy}><SendHorizontal className="size-4" /></button>
        </form>
        {busy ? <p className="mt-2 text-xs opacity-80" role="status" data-testid="launch-busy">Working: {busy}…</p> : null}
        {err ? <p className="mt-2 text-sm font-semibold text-red-400" role="alert" data-testid="launch-err">{err}</p> : null}
      </section>

      {panel("scan", "1. Scan a token", "DexScreener, on-chain data and the token’s own metadata", ready.scan, (
        <>
          <label className={labelCls} htmlFor="l-mint">Token address</label>
          <div className="flex gap-2">
            <input id="l-mint" className={`${fieldCls} flex-1 font-mono`} value={mint} onChange={(e) => setMint(e.target.value.trim())} spellCheck={false} autoComplete="off" placeholder="Mint address" />
            <button type="button" className="rk-btn rk-btn-mint" disabled={!!busy || !mint} onClick={() => void handle(mint)} data-testid="scan-btn">Scan</button>
          </div>
          {token ? (
            <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2" data-testid="scan-result">
              <div><dt className="text-xs opacity-70">Name</dt><dd className="font-bold">{token.name} ({token.symbol})</dd></div>
              <div><dt className="text-xs opacity-70">Market cap</dt><dd>{usd(token.marketCapUsd)}</dd></div>
              <div><dt className="text-xs opacity-70">Liquidity</dt><dd>{usd(token.liquidityUsd)}</dd></div>
              <div><dt className="text-xs opacity-70">24h volume</dt><dd>{usd(token.volume24hUsd)}</dd></div>
              <div className="sm:col-span-2"><dt className="text-xs opacity-70">Sources</dt><dd>{token.sources.join(", ") || "none"}{token.isPump ? " · pump.fun mint" : ""}</dd></div>
              {token.warnings.map((w) => <div key={w} className="sm:col-span-2 text-amber-300">{w}</div>)}
            </dl>
          ) : null}
        </>
      ))}

      {panel("draft", "2. River’s version", "Name, ticker and description. Edit anything.", ready.draft, draft ? (
        <div className="grid gap-3" data-testid="draft">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2"><label className={labelCls} htmlFor="d-name">Name</label><input id="d-name" className={fieldCls} maxLength={32} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div>
            <div><label className={labelCls} htmlFor="d-tick">Ticker</label><input id="d-tick" className={`${fieldCls} font-mono`} maxLength={10} value={draft.ticker} onChange={(e) => setDraft({ ...draft, ticker: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })} /></div>
          </div>
          <div><label className={labelCls} htmlFor="d-desc">Description ({draft.description.length}/280)</label><textarea id="d-desc" className={`${fieldCls} min-h-24`} maxLength={280} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></div>
          {draft.notes ? <p className="text-xs opacity-75">{draft.notes}</p> : null}
          <div className="flex gap-2"><button type="button" className="rk-btn rk-btn-white rk-btn-sm" disabled={!token || !!busy} onClick={() => token && void runDraft(token)}>Ask River again</button></div>
        </div>
      ) : <p className="text-sm opacity-80">Scan a token and River writes this for you.</p>)}

      {panel("image", "3. Image", "Generated automatically with FLUX", ready.image, (
        <div className="grid gap-3">
          {image ? <img src={image} alt={`Generated artwork for ${draft?.name ?? "the token"}`} className="aspect-square w-full max-w-xs rounded-2xl object-cover" data-testid="launch-image" /> : <p className="text-sm opacity-80">{busy === "image" ? "Drawing…" : "The image appears here after the draft."}</p>}
          {draft ? (<><label className={labelCls} htmlFor="d-img">Image prompt</label><textarea id="d-img" className={`${fieldCls} min-h-20`} maxLength={300} value={draft.imagePrompt} onChange={(e) => setDraft({ ...draft, imagePrompt: e.target.value })} /><div><button type="button" className="rk-btn rk-btn-white rk-btn-sm" disabled={!!busy} onClick={() => void runImage(draft.imagePrompt)}>Make it again</button></div></>) : null}
          {imageErr ? <p className="text-sm text-red-400" role="alert" data-testid="image-err">{imageErr}</p> : null}
        </div>
      ))}

      {panel("vanity", "4. Vanity address (optional)", "Grind a custom mint address in your browser", false, <VanityTool />)}

      {panel("fees", "5. Fee split", "70% to you, 30% to the platform. Permanent once launched.", ready.fees, (
        <div className="grid gap-3">
          <fieldset className="grid gap-2"><legend className={labelCls}>Launch mode</legend>
            <label className="flex min-h-11 items-center gap-3 text-sm"><input type="radio" name="mode" className="size-5 accent-[var(--rk-honey)]" checked={mode === "sponsored"} onChange={() => setMode("sponsored")} />Sponsored: the platform treasury pays the fees</label>
            <label className="flex min-h-11 items-center gap-3 text-sm"><input type="radio" name="mode" className="size-5 accent-[var(--rk-honey)]" checked={mode === "own"} onChange={() => setMode("own")} />My own wallet signs and pays</label>
          </fieldset>
          <div><label className={labelCls} htmlFor="l-wallet">Your fee wallet</label><input id="l-wallet" className={`${fieldCls} font-mono`} value={wallet} onChange={(e) => setWallet(e.target.value.trim())} spellCheck={false} autoComplete="off" /></div>
          {!treasury ? <p className="text-sm text-amber-300" role="alert">The platform treasury address is not set. Set NEXT_PUBLIC_TREASURY_PUBKEY in the environment.</p> : null}
          {wallet && !isSolanaAddress(wallet) ? <p className="text-sm text-red-400" role="alert">That is not a valid Solana address.</p> : null}
          {clash ? <p className="text-sm text-amber-300" role="alert" data-testid="split-clash">{clash}</p> : null}
          {split ? <ul className="text-sm" data-testid="split-rows">{split.map((s) => <li key={s.label} className="break-all"><b>{bpsToPercent(s.shareBps)}</b> {s.label}: <span className="font-mono text-xs">{s.address}</span></li>)}</ul> : null}
        </div>
      ))}

      {panel("sim", "6. Simulate the launch", "How much of the curve your dev buy takes", ready.sim, (
        <div className="grid gap-3">
          <div><label className={labelCls} htmlFor="l-dev">Dev buy (SOL)</label><input id="l-dev" inputMode="decimal" className={fieldCls} value={devSol} onChange={(e) => setDevSol(e.target.value)} /></div>
          {sim ? <><p className="text-sm" data-testid="sim-out">You would hold about {sim.devPct.toFixed(2)}% of the supply. Starting market cap is {sim.startMcSol.toFixed(1)} SOL.</p>{sim.warnings.map((w) => <p key={w.text} className={`text-sm ${w.level === "bad" ? "text-red-400" : "text-amber-300"}`}>{w.text}</p>)}</> : <p className="text-sm text-red-400">Enter a number of SOL.</p>}
        </div>
      ))}

      {panel("approve", "7. Approve and launch", "Nothing moves until you say so", false, (
        <div className="grid gap-3">
          <div role="tablist" aria-label="Launch type" className="grid grid-cols-2 gap-2">
            <button type="button" role="tab" aria-selected={mode === "sponsored"} data-testid="tab-agent" className={`rk-btn ${mode === "sponsored" ? "rk-btn-honey" : "rk-btn-white"}`} onClick={() => setMode("sponsored")}>Agent launch (free)</button>
            <button type="button" role="tab" aria-selected={mode === "own"} data-testid="tab-self" className={`rk-btn ${mode === "own" ? "rk-btn-honey" : "rk-btn-white"}`} onClick={() => setMode("own")}>Self launch</button>
          </div>
          <ul className="grid gap-1 text-sm">
            {([["scan", "Token scanned"], ["draft", "River draft"], ["image", "Image"], ["fees", "Fee wallet and 70/30 split"], ["sim", "Simulation safe"]] as const).map(([k, l]) => <li key={k} className="flex items-center gap-2">{chip(ready[k])} {l}</li>)}
          </ul>
          {mode === "sponsored" ? <p className="text-sm" data-testid="exec-blocked">{executeBlockedReason}</p> : null}
          <p className="text-sm" data-testid="mode-help">{mode === "sponsored" ? "Agent launch: the platform treasury agent wallet pays. You get 70%, the platform 30%." : "Self launch: your wallet pays and you are the creator. You get 95%, the platform 5%."} Prefer a clean standalone page that anyone can use? <Link href="/self-launch" className="underline" data-testid="goto-self-launch">Open the Self launch page</Link>.</p>
          {mode === "own" ? (
            <SelfLaunch name={draft?.name ?? ""} ticker={draft?.ticker ?? ""} description={draft?.description ?? ""} image={image} links={{ website: token?.links.website, twitter: token?.links.twitter, telegram: token?.links.telegram }} feeWallet={wallet} devBuySol={Number(devSol) || 0} ready={allReady} blockedReason={selfBlockedReason} onUseWallet={setWallet} say={say} />
          ) : null}
          <div className={mode === "own" ? "hidden" : "flex flex-wrap gap-2"}>
            <button type="button" className="rk-btn rk-btn-white" disabled={!pkg} onClick={download} data-testid="pkg-btn">Download launch package</button>
            <button type="button" className="rk-btn rk-btn-white" disabled={!allReady || !!busy} onClick={() => void runPrepare()} data-testid="prepare-btn">{busy === "prepare" ? "Preparing…" : "Prepare launch"}</button>
            <button type="button" className="rk-btn rk-btn-mint" disabled={!prep || !!executeBlockedReason || !!busy || mode === "own"} onClick={() => void runLaunch()} data-testid="launch-btn">{executeBlockedReason ? "Launch (blocked)" : "Approve and launch"}</button>
          </div>
          {prepErr ? <p className="text-sm text-red-400" role="alert" data-testid="prep-err">{prepErr}</p> : null}
          {prep ? (
            <div className="grid gap-1 rounded-xl bg-white/5 p-3 text-sm" data-testid="prep-out">
              <p><b>{prep.plan.name}</b> ({prep.plan.symbol}) on {prep.plan.network}</p>
              <p className="break-all text-xs">New token address: <span className="font-mono">{prep.plan.mint}</span></p>
              <p className="break-all text-xs">Details link: <a className="underline" href={prep.plan.uri} target="_blank" rel="noreferrer">{prep.plan.uri}</a></p>
              <p className="text-xs">Transactions: {prep.tx1Bytes} and {prep.tx2Bytes} bytes (limit 1232). {prep.simulation.note}</p>
              <p className="text-xs opacity-80">Approval is valid for 10 minutes and only for exactly this plan.</p>
            </div>
          ) : null}
          {launchMsg ? <p className="text-sm break-all" role="status" data-testid="launch-msg">{launchMsg} {launchMsg.includes("Retry") ? <button type="button" className="underline" onClick={() => void runRetry()}>Retry the split</button> : null}</p> : null}
        </div>
      ))}
    </div>
  );
}
