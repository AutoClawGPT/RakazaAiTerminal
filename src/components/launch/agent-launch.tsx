"use client";
/* eslint-disable @next/next/no-img-element -- generated data URL, next/image cannot optimise it */
import { useEffect, useRef, useState } from "react";
import { Check, CircleDashed, Loader2, X } from "lucide-react";
import { fieldCls, labelCls } from "@/components/tools/tool-frame";
import { VampRows, loadWatch, saveWatch } from "@/components/tools/vamp-radar";
import { vampScanAction } from "@/app/(dash)/scanner/actions";
import { imageAction, launchAction, type PrepareOut } from "@/app/(dash)/launch/actions";
import { autoAnalyzeAction, autoPinAction, autoPrepareAction, autoRiskAction, autoTrustAction, type AutoTrust } from "@/app/(dash)/launch/auto-actions";
import { ledgerAction } from "@/app/(dash)/history/actions";
import { autoKit, fillCa, threadText, type AutoState } from "@/lib/launch/auto-kit";
import { bpsToPercent, platformSplit } from "@/lib/tools/splits";
import { isSolanaAddress } from "@/lib/tools/address";
import type { VampResult } from "@/lib/launch/vamp";
import type { AutoDraft, FlagRisk } from "@/lib/launch/auto";
import type { ExecResult } from "@/lib/launch/execute";
import type { LedgerRow } from "@/lib/launch/ledger";

type StepId = "scan" | "analyze" | "risk" | "image" | "pin" | "trust" | "prepare" | "launch";
type StepStatus = "idle" | "run" | "done" | "fail";
const STEPS: { id: StepId; label: string }[] = [
  { id: "scan", label: "Vamp Radar and Shield scan" },
  { id: "analyze", label: "River studies the flagged tokens" },
  { id: "risk", label: "Copy-risk check on the new name" },
  { id: "image", label: "Image from Pollinations" },
  { id: "pin", label: "Image and metadata JSON to IPFS (Pinata)" },
  { id: "trust", label: "Trust check on your fee wallet" },
  { id: "prepare", label: "Build, dry-run and approve the launch" },
  { id: "launch", label: "Launch with the 70/30 split" },
];
const init = (): Record<StepId, { s: StepStatus; note: string }> => Object.fromEntries(STEPS.map((x) => [x.id, { s: "idle", note: "" }])) as Record<StepId, { s: StepStatus; note: string }>;

const sol = (l: number) => (l / 1e9).toFixed(l >= 1e7 ? 4 : 6);
const cluster = (n: string) => (n === "mainnet-beta" ? "" : `?cluster=${n}`);
const ago = (ms: number) => `${Math.max(0, Math.round(ms / 1000))}s`;
const RISK_RETRIES = 2;

export function AgentLaunch({ treasury, network, executeBlockedReason }: { treasury?: string; network: "devnet" | "mainnet-beta"; executeBlockedReason: string }) {
  const [ca, setCa] = useState("");
  const [steps, setSteps] = useState(init);
  const [vamp, setVamp] = useState<VampResult | null>(null);
  const [draft, setDraft] = useState<AutoDraft | null>(null);
  const [risk, setRisk] = useState<FlagRisk | null>(null);
  const [tries, setTries] = useState<string[]>([]);
  const [image, setImage] = useState("");
  const [pinned, setPinned] = useState<{ imageUrl: string; uri: string } | null>(null);
  const [wallet, setWallet] = useState("");
  const [devSol, setDevSol] = useState("0");
  const [ground, setGround] = useState("");
  const [groundAddr, setGroundAddr] = useState("");
  const [trust, setTrust] = useState<AutoTrust | null>(null);
  const [prep, setPrep] = useState<{ out: PrepareOut; grounded: boolean } | null>(null);
  const [done, setDone] = useState<ExecResult | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [watched, setWatched] = useState(false);
  const run = useRef(0);
  const [secs, setSecs] = useState(0);

  useEffect(() => { if (!busy) return; const i = setInterval(() => setSecs((x) => x + 1), 1000); return () => clearInterval(i); }, [busy]);
  const set = (id: StepId, s: StepStatus, note = "") => setSteps((x) => ({ ...x, [id]: { s, note } }));

  const blockedWhy = executeBlockedReason;
  const split = treasury && isSolanaAddress(wallet.trim()) ? platformSplit(wallet.trim(), treasury) : null;
  const mint = prep?.out.plan.mint ?? "";

  const reset = () => { run.current++; setSteps(init()); setVamp(null); setDraft(null); setRisk(null); setTries([]); setImage(""); setPinned(null); setTrust(null); setPrep(null); setDone(null); setErr(""); setBusy(false); setWatched(false); };

  // Stage A: scan, River, risk, image, pin. Everything before the user gives a wallet.
  const startA = async (addr: string) => {
    const id = ++run.current;
    const live = () => run.current === id;
    setSteps(init()); setVamp(null); setDraft(null); setRisk(null); setTries([]); setImage(""); setPinned(null); setTrust(null); setPrep(null); setDone(null); setErr(""); setWatched(false);
    setBusy(true); setSecs(0);
    const fail = (s: StepId, e: string) => { if (live()) { set(s, "fail", e); setErr(e); setBusy(false); } };

    set("scan", "run", "Searching DexScreener for lookalikes…");
    const v = await vampScanAction(addr);
    if (!live()) return;
    if (!v.ok) return fail("scan", v.error);
    setVamp(v.result);
    set("scan", "done", `${v.result.flagged} flagged. Shield grade ${v.result.shield.grade}.`);
    setWatched(loadWatch().some((w) => w.mint === addr));

    let best: { d: AutoDraft; r: FlagRisk } | null = null;
    const avoid: string[] = [];
    for (let i = 0; i <= RISK_RETRIES; i++) {
      set("analyze", "run", i === 0 ? "River is reading the flagged tokens…" : `Trying again, attempt ${i + 1}, avoiding ${avoid.length} names…`);
      const a = await autoAnalyzeAction(addr, avoid);
      if (!live()) return;
      if (!a.ok) return fail("analyze", a.error);
      set("analyze", "done", a.draft.fromRiver ? `${a.draft.name} ($${a.draft.ticker})` : "River was unreachable. Plain template used, review it.");
      set("risk", "run", `Checking ${a.draft.name} / ${a.draft.ticker} for copycats…`);
      const k = await autoRiskAction(a.draft.name, a.draft.ticker);
      if (!live()) return;
      if (!k.ok) return fail("risk", k.error);
      if (!best || k.risk.score < best.r.score) best = { d: a.draft, r: k.risk };
      setDraft(best.d); setRisk(best.r);
      const clean = k.risk.level === "low" && k.risk.score < 40;
      set("risk", clean ? "done" : "run", clean ? "Low chance of being flagged." : `Risk ${k.risk.level}${k.risk.top ? `, closest: ${k.risk.top.symbol}` : ""}.`);
      if (clean) break;
      avoid.push(a.draft.name, a.draft.ticker, ...(k.risk.top ? [k.risk.top.name, k.risk.top.symbol] : []));
      setTries([...avoid]);
    }
    if (!best) return fail("risk", "No draft was made.");
    set("risk", "done", `Best of ${Math.min(RISK_RETRIES + 1, avoid.length / 2 + 1)} tries: risk ${best.r.level} (score ${best.r.score}).`);

    set("image", "run", "Pollinations is drawing the logo…");
    const im = await imageAction(best.d.imagePrompt);
    if (!live()) return;
    if (!im.ok) return fail("image", im.error);
    setImage(im.dataUrl);
    set("image", "done", `${ago(im.ms)} of drawing.`);

    set("pin", "run", "Uploading image, then metadata JSON…");
    const p = await autoPinAction({ name: best.d.name, ticker: best.d.ticker, description: best.d.description, imageDataUrl: im.dataUrl, links: {} });
    if (!live()) return;
    if (!p.ok) return fail("pin", p.error);
    setPinned({ imageUrl: p.imageUrl, uri: p.uri });
    set("pin", "done", p.uri);
    setBusy(false);
  };

  const readGround = async (f: File | undefined) => {
    setGround(""); setGroundAddr("");
    if (!f) return;
    const text = await f.text();
    try {
      const a = JSON.parse(text);
      if (!Array.isArray(a) || a.length !== 64) throw new Error("bad");
      const { Keypair } = await import("@solana/web3.js");
      const kp = Keypair.fromSecretKey(Uint8Array.from(a));
      setGround(text); setGroundAddr(kp.publicKey.toBase58());
    } catch { setErr("That file is not a 64-number keypair JSON from the grinder."); }
  };

  // Stage B: trust check on the fee wallet, then build and approve.
  const startB = async () => {
    if (!draft || !pinned) return;
    const id = ++run.current;
    const live = () => run.current === id;
    setErr(""); setBusy(true); setTrust(null); setPrep(null); setDone(null);
    set("trust", "run", "Checking the wallet…"); set("prepare", "idle"); set("launch", "idle");
    const t = await autoTrustAction(wallet.trim());
    if (!live()) return;
    if (!t.ok) { set("trust", "fail", t.error); setErr(t.error); setBusy(false); return; }
    setTrust(t.trust);
    if (t.trust.blocked) { const e = t.trust.notes.join(" ") || "That wallet cannot receive fees."; set("trust", "fail", e); setErr(e); setBusy(false); return; }
    set("trust", "done", t.trust.notes[0] ?? "Wallet looks normal.");
    set("prepare", "run", "Building the transactions and dry-running them…");
    const p = await autoPrepareAction({ name: draft.name, ticker: draft.ticker, description: draft.description, uri: pinned.uri, imageUrl: pinned.imageUrl, feeWallet: wallet.trim(), devBuySol: Number(devSol) || 0, groundMint: ground || undefined });
    if (!live()) return;
    if (!p.ok) { set("prepare", "fail", p.error); setErr(p.error); setBusy(false); return; }
    setPrep({ out: p.out, grounded: p.grounded });
    set("prepare", p.out.simulation.ok ? "done" : "fail", p.out.simulation.note);
    setBusy(false);
  };

  const launch = async () => {
    if (!prep) return;
    setBusy(true); setSecs(0); setErr(""); set("launch", "run", "Signing and sending…");
    const r = await launchAction(prep.out.plan, prep.out.ticket, prep.out.sealedMint);
    if (!r.ok) { set("launch", "fail", r.error); setErr(r.error); setBusy(false); return; }
    setDone(r.result);
    set("launch", r.result.ok ? "done" : "fail", r.result.ok ? "Live." : (r.result.error ?? "Stopped."));
    if (!r.result.ok) setErr(r.result.error ?? "The launch stopped.");
    if (r.result.tx1 || r.result.ok) {
      const list = loadWatch().filter((w) => w.mint !== prep.out.plan.mint);
      list.unshift({ mint: prep.out.plan.mint, symbol: prep.out.plan.symbol, flagged: 0, at: new Date().toISOString() });
      saveWatch(list);
    }
    setBusy(false);
  };

  const addWatch = () => {
    if (!vamp) return;
    saveWatch([{ mint: vamp.mint, symbol: vamp.token.symbol, flagged: vamp.flagged, at: vamp.scannedAt }, ...loadWatch().filter((w) => w.mint !== vamp.mint)]);
    setWatched(true);
  };

  const state: AutoState = {
    vampScanned: !!vamp, groundMint: prep?.grounded ? prep.out.plan.mint : null, riskLevel: risk?.level ?? null,
    imageUrl: pinned?.imageUrl ?? "", uri: pinned?.uri ?? "", name: draft?.name ?? "", ticker: draft?.ticker ?? "", description: draft?.description ?? "", thread: draft?.thread ?? [],
    dryRunOk: !!prep?.out.simulation.ok, splitChecked: !!prep, mintSealed: !!prep,
  };
  const kit = autoKit(state);
  const kitDone = kit.filter((k) => k.state === "done").length;
  const stageADone = !!pinned && !busy;
  const caValid = isSolanaAddress(ca.trim());
  const elapsed = busy ? `${secs}s` : "";

  const icon = (s: StepStatus) => s === "done" ? <Check className="size-4 text-emerald-400" aria-hidden="true" /> : s === "run" ? <Loader2 className="size-4 animate-spin text-[var(--rk-honey)]" aria-hidden="true" /> : s === "fail" ? <X className="size-4 text-red-400" aria-hidden="true" /> : <CircleDashed className="size-4 opacity-40" aria-hidden="true" />;

  return (
    <section className="rk-card grid gap-4" aria-label="Agent launch" data-testid="agent-launch">
      <div>
        <p className="rk-kicker">Agent launch · full auto</p>
        <h2 className="rk-h2 text-xl">Paste a token. The agent does the rest.</h2>
        <p className="mt-1 text-sm opacity-80">Vamp Radar → River analysis → image → IPFS → Launch Kit → 70/30 launch. You only give your fee wallet. Nothing is signed until you press Launch.</p>
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <div>
          <label className={labelCls} htmlFor="al-ca">Token address (CA) to study</label>
          <input id="al-ca" className={fieldCls} value={ca} onChange={(e) => setCa(e.target.value)} placeholder="Paste the contract address" spellCheck={false} autoComplete="off" data-testid="al-ca" />
        </div>
        <div className="flex items-end gap-2">
          <button type="button" className="rk-btn rk-btn-mint" disabled={!caValid || busy} onClick={() => void startA(ca.trim())} data-testid="al-run">{busy ? `Working… ${elapsed}` : steps.scan.s === "idle" ? "Run the agent" : "Run again"}</button>
          {steps.scan.s !== "idle" ? <button type="button" className="rk-btn rk-btn-white" onClick={reset}>Reset</button> : null}
        </div>
      </div>
      {ca && !caValid ? <p className="text-xs text-amber-300">That does not look like a Solana address yet.</p> : null}

      <ol className="grid gap-1.5 text-sm" aria-live="polite" data-testid="al-steps">
        {STEPS.map((x) => (
          <li key={x.id} className="flex items-start gap-2" data-step={x.id} data-status={steps[x.id].s}>
            <span className="mt-0.5">{icon(steps[x.id].s)}</span>
            <span><b className={steps[x.id].s === "idle" ? "opacity-60" : ""}>{x.label}</b>{steps[x.id].note ? <span className="ml-2 break-all text-xs opacity-80">{steps[x.id].note}</span> : null}</span>
          </li>
        ))}
      </ol>
      {err ? <p className="text-sm text-red-400" role="alert" data-testid="al-err">{err}</p> : null}

      {vamp ? <div className="rounded-2xl border border-white/15 p-3"><VampRows r={vamp} onScan={() => void startA(vamp.mint)} busy={busy} onWatch={addWatch} watched={watched} /></div> : null}

      {draft ? (
        <div className="grid gap-3 rounded-2xl border border-white/15 p-3" data-testid="al-draft">
          <p className="rk-kicker">River’s read {draft.fromRiver ? "" : "(plain template, River was unreachable)"}</p>
          <dl className="grid gap-2 text-sm">
            <div><dt className="rk-kicker">Why they were flagged</dt><dd>{draft.analysis.whyFlagged}</dd></div>
            <div><dt className="rk-kicker">What happened</dt><dd>{draft.analysis.whatHappened}</dd></div>
            <div><dt className="rk-kicker">What is different here</dt><dd>{draft.analysis.plan}</dd></div>
            <div><dt className="rk-kicker">Potential</dt><dd>{draft.analysis.potential}</dd></div>
          </dl>
          <div className="flex flex-wrap items-start gap-4">
            {image ? <img src={image} alt={`Logo for ${draft.name}`} className="size-28 rounded-xl border border-white/20" /> : null}
            <div className="grid min-w-0 flex-1 gap-1 text-sm">
              <p><b className="text-lg">{draft.name}</b> <span className="font-mono">${draft.ticker}</span></p>
              <p>{draft.description}</p>
              {risk ? <p className="text-xs"><span className={`rounded-full px-2 py-0.5 font-bold ${risk.level === "low" ? "bg-emerald-400/90 text-black" : "bg-[var(--rk-honey)] text-black"}`}>flag chance {risk.level}</span> {risk.flagged} similar name or ticker found{risk.top ? `, closest ${risk.top.symbol}` : ""}.{tries.length ? ` River tried again ${tries.length / 2 | 0} time(s).` : ""}</p> : null}
              {pinned ? <p className="break-all text-xs opacity-80">Metadata <a className="underline" href={pinned.uri} target="_blank" rel="noreferrer">{pinned.uri}</a></p> : null}
            </div>
          </div>
        </div>
      ) : null}

      {draft ? (
        <div className="grid gap-2 rounded-2xl border border-white/15 p-3" data-testid="al-kit">
          <p className="rk-kicker">Launch Kit · {kitDone}/9 ticked</p>
          <ul className="grid gap-1 text-sm">
            {kit.map((k) => (
              <li key={k.id} className="flex items-start gap-2" data-kit={k.id} data-state={k.state}>
                <span className="mt-0.5">{k.state === "done" ? <Check className="size-4 text-emerald-400" aria-hidden="true" /> : <CircleDashed className="size-4 opacity-40" aria-hidden="true" />}</span>
                <span><b>{k.label}</b> <span className="text-xs opacity-80">{k.detail}</span></span>
              </li>
            ))}
          </ul>
          <details className="text-sm" open>
            <summary className="cursor-pointer font-semibold">Launch thread ({draft.thread.length} posts)</summary>
            <ol className="mt-2 grid gap-2">{fillCa(draft.thread, done?.ok && mint ? mint : "").map((p, i) => <li key={i} className="whitespace-pre-wrap rounded-xl bg-white/10 p-2.5">{p} <span className="text-[11px] opacity-60">{p.length}/280</span></li>)}</ol>
            <button type="button" className="rk-btn rk-btn-white rk-btn-sm mt-2" onClick={() => void navigator.clipboard?.writeText(threadText(draft.thread, done?.ok && mint ? mint : "", draft.name, draft.ticker))}>Copy thread</button>
          </details>
        </div>
      ) : null}

      {stageADone && !done?.ok ? (
        <div className="grid gap-3 rounded-2xl border border-white/15 p-3" data-testid="al-wallet">
          <p className="rk-kicker">Your fee wallet</p>
          <div>
            <label className={labelCls} htmlFor="al-wallet">Solana wallet that gets 70% of the creator fees, forever</label>
            <input id="al-wallet" className={fieldCls} value={wallet} onChange={(e) => { setWallet(e.target.value); setPrep(null); }} placeholder="Your wallet address" spellCheck={false} autoComplete="off" data-testid="al-wallet-input" />
          </div>
          {split ? <p className="text-sm" data-testid="al-split">{split.map((s) => `${s.address === treasury ? "Platform" : "You"} ${bpsToPercent(s.shareBps)}%`).join(" · ")}. The split is set on-chain and cannot be changed.</p> : wallet ? <p className="text-xs text-amber-300">That is not a valid Solana address.</p> : null}
          <details className="text-sm">
            <summary className="cursor-pointer font-semibold">Optional: use a ground vanity address</summary>
            <p className="mt-1 text-xs opacity-80">Make one on the Dev tab with <code>node cli/rakaza-grind.mjs --end pump --count 1 --out ./keys</code>, then pick the key file. It signs the create transaction once.</p>
            <input type="file" accept="application/json,.json" className="mt-2 text-xs" onChange={(e) => void readGround(e.target.files?.[0])} data-testid="al-ground" />
            {groundAddr ? <p className="mt-1 break-all text-xs">Will launch at <span className="font-mono">{groundAddr}</span></p> : null}
          </details>
          <div className="grid gap-1 sm:max-w-xs">
            <label className={labelCls} htmlFor="al-dev">Dev buy (SOL, optional)</label>
            <input id="al-dev" className={fieldCls} inputMode="decimal" value={devSol} onChange={(e) => setDevSol(e.target.value)} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="rk-btn rk-btn-mint" disabled={!split || busy} onClick={() => void startB()} data-testid="al-prepare">{busy ? "Working…" : "Check wallet and prepare"}</button>
            {blockedWhy ? <span className="text-xs text-amber-300">{blockedWhy}</span> : null}
          </div>
          {trust ? <p className="text-xs" data-testid="al-trust">Trust check on {trust.network}: {trust.ok ? "wallet looks normal" : "blocked"}. Balance {trust.balanceSol} SOL. {trust.said ? `SAID ${trust.said.registered ? "registered" : "not registered"}.` : ""} {trust.notes.join(" ")}</p> : null}
          {prep ? (
            <div className="grid gap-2 rounded-xl bg-white/10 p-3 text-sm" data-testid="al-ticket">
              <p><b>Ready to launch</b> on {prep.out.plan.network}. Dry run: {prep.out.simulation.note}</p>
              <p className="break-all text-xs">New token address <span className="font-mono">{prep.out.plan.mint}</span>{prep.grounded ? " (ground)" : ""}. Creator (agent wallet) <span className="font-mono">{prep.out.plan.creator}</span>. Dev buy {prep.out.plan.devBuySol} SOL.</p>
              <div><button type="button" className="rk-btn rk-btn-mint" disabled={busy || !!blockedWhy || !prep.out.simulation.ok} onClick={() => void launch()} data-testid="al-launch">{busy ? `Launching… ${elapsed}` : "Approve and launch"}</button></div>
            </div>
          ) : null}
        </div>
      ) : null}

      {done?.tx1 && mint ? <Success mint={mint} plan={prep!.out.plan} done={done} network={network} /> : null}
    </section>
  );
}

function Success({ mint, plan, done, network }: { mint: string; plan: PrepareOut["plan"]; done: ExecResult; network: string }) {
  const [row, setRow] = useState<LedgerRow | null>(null);
  useEffect(() => {
    let stop = false;
    const load = async () => { const r = await ledgerAction(); if (!stop && r.ok) setRow(r.rows.find((x) => x.mint === mint) ?? null); };
    void load();
    const i = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 6000);
    return () => { stop = true; clearInterval(i); };
  }, [mint]);
  const cl = cluster(network);
  const link = "underline break-all";
  const waiting = row?.shares.reduce((a, s) => a + s.pendingLamports, 0) ?? 0;
  const sent = row?.shares.reduce((a, s) => a + s.sentLamports, 0) ?? 0;
  return (
    <div className="grid gap-2 rounded-2xl border border-emerald-400/60 p-3 text-sm" data-testid="al-success">
      <p className="text-lg font-bold">{done.ok ? "Launched" : "Created, split pending"}: {plan.name} (${plan.symbol})</p>
      <p className="break-all">Mint <span className="font-mono text-xs">{mint}</span></p>
      <p className="break-all">Token creator (agent wallet) <a className={`${link} font-mono text-xs`} href={`https://solscan.io/account/${plan.creator}${cl}`} target="_blank" rel="noreferrer">{plan.creator}</a></p>
      <p className="flex flex-wrap gap-x-4">
        <a className={link} href={`https://solscan.io/token/${mint}${cl}`} target="_blank" rel="noreferrer" data-testid="al-solscan">Solscan token ↗</a>
        <a className={link} href={`https://pump.fun/coin/${mint}`} target="_blank" rel="noreferrer" data-testid="al-pump">pump.fun ↗</a>
        {done.tx1 ? <a className={link} href={`https://solscan.io/tx/${done.tx1}${cl}`} target="_blank" rel="noreferrer">Create tx ↗</a> : null}
        {done.tx2 ? <a className={link} href={`https://solscan.io/tx/${done.tx2}${cl}`} target="_blank" rel="noreferrer">Split tx ↗</a> : null}
      </p>
      {network !== "mainnet-beta" ? <p className="text-xs opacity-80">This is {network}. pump.fun only lists mainnet tokens, so its page will be empty until a mainnet launch.</p> : null}
      {done.split ? <p className="text-xs">{done.split.ok ? "70/30 split verified on-chain." : `Split problem: ${done.split.problems.join(" ")}`}</p> : null}
      <div className="rounded-xl bg-white/10 p-2.5" data-testid="al-live-fees">
        <p className="rk-kicker">Live fees · updates every 6 seconds</p>
        <p>{row ? <>Awaiting claim on pump.fun {row.distributableLamports == null ? "unknown" : `${sol(row.distributableLamports)} SOL`} · claimed and waiting to send {sol(waiting)} SOL · sent {sol(sent)} SOL</> : "Waiting for the ledger…"}</p>
        <p className="text-xs opacity-80">The vault claims pump.fun creator fees and pays the shareholders. See every token on the <a className="underline" href="/fees">Fees tab</a>.</p>
      </div>
    </div>
  );
}
