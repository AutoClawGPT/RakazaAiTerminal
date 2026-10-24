"use client";
import { useMemo, useRef, useState } from "react";
import { Keypair, VersionedTransaction } from "@solana/web3.js";
import { ConnectionProvider, WalletProvider, useWallet } from "@solana/wallet-adapter-react";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { prepareSelfLaunchAction, selfRelayAction, selfTxAction } from "@/app/(dash)/launch/actions";
import type { LaunchPlan } from "@/lib/launch/approval";

export interface SelfLaunchProps {
  name: string; ticker: string; description: string; image: string;
  links: { website?: string; twitter?: string; telegram?: string };
  feeWallet: string; devBuySol: number; ready: boolean; blockedReason: string;
  onUseWallet: (addr: string) => void; say: (t: string) => void;
}

/** Network blips on the RPC are retried a few times. A real rejection from the chain or the server is never retried. */
const TRANSIENT = /fetch failed|timed? ?out|429|503|ECONNRESET|socket hang up|network/i;
async function withRetry<T>(fn: () => Promise<{ ok: true } & T | { ok: false; error: string }>): Promise<{ ok: true } & T | { ok: false; error: string }> {
  let last: { ok: false; error: string } = { ok: false, error: "Stopped." };
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fn();
      if (r.ok || !TRANSIENT.test(r.error)) return r;
      last = r;
    } catch (e) { last = { ok: false, error: e instanceof Error ? e.message : "Stopped." }; if (!TRANSIENT.test(last.error)) return last; }
    await new Promise((res) => setTimeout(res, 1500 * (i + 1)));
  }
  return last;
}

type Step = { label: string; state: "todo" | "doing" | "done" | "fail"; sig?: string };
const fresh = (): Step[] => [{ label: "Prepare and approve the plan", state: "todo" }, { label: "Create the token (your wallet signs)", state: "todo" }, { label: "Set the 95/5 split (your wallet signs)", state: "todo" }, { label: "Dev buy (your wallet signs, if any)", state: "todo" }];

function Inner(p: SelfLaunchProps) {
  const w = useWallet();
  const [steps, setSteps] = useState<Step[]>(fresh);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [done, setDone] = useState("");
  const set = (i: number, patch: Partial<Step>) => setSteps((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const addr = w.publicKey?.toBase58() ?? "";
  // Kept so a stopped launch can resume from the failed step instead of starting a second token.
  const session = useRef<{ plan: LaunchPlan; ticket: string; mintKp: Keypair; next: 1 | 2 | 3 } | null>(null);
  const [canResume, setCanResume] = useState(false);

  const run = async (resume = false) => {
    if (!w.publicKey || !w.signTransaction) { setErr("Connect a wallet first."); return; }
    setBusy(true); setErr(""); setDone(""); setCanResume(false);
    let at = 0;
    try {
      let plan: LaunchPlan, ticket: string, mintKp: Keypair, from: 1 | 2 | 3;
      if (resume && session.current) {
        ({ plan, ticket, mintKp } = session.current); from = session.current.next;
        setSteps((st) => st.map((x, j) => (j >= from ? { ...x, state: "todo", sig: undefined } : x)));
      } else {
        setSteps(fresh());
        mintKp = Keypair.generate(); // generated here; the secret never leaves this page
        set(0, { state: "doing" });
        const prep = await prepareSelfLaunchAction({ name: p.name, ticker: p.ticker, description: p.description, imageDataUrl: p.image, links: p.links, feeWallet: p.feeWallet || addr, devBuySol: p.devBuySol, wallet: addr, mint: mintKp.publicKey.toBase58(), confirmSplit: confirmed });
        if (!prep.ok) throw new Error(prep.error);
        plan = prep.plan; ticket = prep.ticket; from = 1;
        session.current = { plan, ticket, mintKp, next: 1 };
        set(0, { state: "done" });
      }

      const signStep = async (step: "create" | "split" | "buy", i: 1 | 2 | 3, mintSigner?: Keypair) => {
        at = i; set(i, { state: "doing" });
        const t = await withRetry(() => selfTxAction(plan, ticket, step));
        if (!t.ok) throw new Error(t.error);
        const tx = VersionedTransaction.deserialize(Uint8Array.from(atob(t.tx), (c) => c.charCodeAt(0)));
        if (mintSigner) tx.sign([mintSigner]); // the mint signs first, then the wallet
        const signed = await w.signTransaction!(tx);
        let bin = ""; for (const b of signed.serialize()) bin += String.fromCharCode(b);
        const r = await selfRelayAction(plan, ticket, step, btoa(bin));
        if (!r.ok) throw new Error(r.error);
        set(i, { state: "done", sig: r.sig });
        if (session.current) session.current.next = Math.min(3, i + 1) as 1 | 2 | 3;
        return r;
      };

      if (from <= 1) await signStep("create", 1, mintKp);
      if (from <= 2) {
        const sp = await signStep("split", 2);
        if (sp.split && !sp.split.ok) throw new Error(`The token exists but the split did not verify: ${sp.split.problems.join(" ")}`);
      }
      if (p.devBuySol > 0) await signStep("buy", 3); else set(3, { state: "done" });
      const msg = `Launched from your wallet. Token ${plan.mint} is live with the 95/5 split verified on-chain.`;
      setDone(msg); p.say(msg);
      session.current = null;
    } catch (e) {
      const m = e instanceof Error ? e.message : "Stopped.";
      set(at, { state: "fail" });
      const resumable = !!session.current && at >= 1;
      setCanResume(resumable);
      setErr(resumable ? `${m} Your token is not lost. Press Resume to continue from this step.` : m);
      p.say(`Self launch stopped: ${m}`);
    }
    setBusy(false);
  };

  return (
    <div className="grid gap-3" data-testid="self-launch">
      <p className="text-sm">You pay the network fees and the dev buy from your own wallet. The platform never sees your key. You keep 95% of the creator fees and 5% goes to the platform as a sponsorship that pays for and promotes this app. It is set the same way and checked on-chain.</p>
      {!w.connected ? (
        <div className="flex flex-wrap gap-2">
          {w.wallets.filter((x) => x.adapter.name === "Phantom" || x.adapter.name === "Solflare").map((x) => (
            <button key={x.adapter.name} type="button" className="rk-btn rk-btn-white" data-testid={`connect-${x.adapter.name.toLowerCase()}`} disabled={w.connecting}
              onClick={async () => { try { setErr(""); w.select(x.adapter.name); await x.adapter.connect(); } catch (e) { setErr(e instanceof Error && e.message ? e.message : "Could not connect the wallet."); } }}>
              Connect {x.adapter.name}{x.readyState === "NotDetected" ? " (not detected)" : ""}
            </button>
          ))}
        </div>
      ) : (
        <div className="grid gap-2 rounded-xl bg-white/5 p-3 text-sm">
          <p className="break-all">Connected: <span className="font-mono text-xs" data-testid="self-addr">{addr}</span></p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="rk-btn rk-btn-white rk-btn-sm" onClick={() => p.onUseWallet(addr)}>Use it as my fee wallet</button>
            <button type="button" className="rk-btn rk-btn-white rk-btn-sm" onClick={() => void w.disconnect()}>Disconnect</button>
          </div>
        </div>
      )}
      <label className="flex min-h-11 items-start gap-2 text-sm"><input type="checkbox" className="mt-1 h-5 w-5" data-testid="self-confirm" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /><span>I confirm the fee split: I keep 95% of creator fees and 5% goes to the platform. It cannot be changed after launch.</span></label>
      <button type="button" className="rk-btn rk-btn-mint" data-testid="self-go" disabled={!w.connected || !p.ready || busy || !confirmed || !!p.blockedReason} onClick={() => void run(false)}>
        {p.blockedReason ? "Self launch (blocked)" : busy ? "Waiting for your wallet…" : "Launch from my wallet"}
      </button>
      {canResume ? <button type="button" className="rk-btn rk-btn-honey" data-testid="self-resume" disabled={busy || !w.connected} onClick={() => void run(true)}>Resume from the failed step</button> : null}
      {p.blockedReason ? <p className="text-sm text-amber-300">{p.blockedReason}</p> : null}
      {!p.ready ? <p className="text-xs opacity-80">Finish steps 1 to 6 first (scan, draft, image, fee wallet, simulation).</p> : null}
      <ol className="grid gap-1 text-sm" data-testid="self-steps">
        {steps.map((s) => (
          <li key={s.label} className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${s.state === "done" ? "bg-emerald-400/90 text-black" : s.state === "fail" ? "bg-red-400 text-black" : s.state === "doing" ? "bg-[var(--rk-honey)] text-black" : "bg-white/15"}`}>{s.state}</span>
            {s.label}{s.sig ? <span className="break-all font-mono text-[11px] opacity-80">{s.sig}</span> : null}
          </li>
        ))}
      </ol>
      {err ? <p className="text-sm text-red-400" role="alert" data-testid="self-err">{err}</p> : null}
      {done ? <p className="text-sm break-all" role="status" data-testid="self-done">{done}</p> : null}
    </div>
  );
}

export function SelfLaunch(p: SelfLaunchProps) {
  const wallets = useMemo(() => [new PhantomWalletAdapter(), new SolflareWalletAdapter()], []);
  return (
    <ConnectionProvider endpoint="https://api.devnet.solana.com">
      <WalletProvider wallets={wallets} autoConnect={false}><Inner {...p} /></WalletProvider>
    </ConnectionProvider>
  );
}
