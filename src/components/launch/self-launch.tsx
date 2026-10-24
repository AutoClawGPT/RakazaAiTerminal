"use client";
import { useMemo, useState } from "react";
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

type Step = { label: string; state: "todo" | "doing" | "done" | "fail"; sig?: string };
const fresh = (): Step[] => [{ label: "Prepare and approve the plan", state: "todo" }, { label: "Create the token (your wallet signs)", state: "todo" }, { label: "Set the 70/30 split (your wallet signs)", state: "todo" }, { label: "Dev buy (your wallet signs, if any)", state: "todo" }];

function Inner(p: SelfLaunchProps) {
  const w = useWallet();
  const [steps, setSteps] = useState<Step[]>(fresh);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");
  const set = (i: number, patch: Partial<Step>) => setSteps((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const addr = w.publicKey?.toBase58() ?? "";

  const run = async () => {
    if (!w.publicKey || !w.signTransaction) { setErr("Connect a wallet first."); return; }
    setBusy(true); setErr(""); setDone(""); setSteps(fresh());
    let at = 0;
    try {
      const mintKp = Keypair.generate(); // generated here; the secret never leaves this page
      set(0, { state: "doing" });
      const prep = await prepareSelfLaunchAction({ name: p.name, ticker: p.ticker, description: p.description, imageDataUrl: p.image, links: p.links, feeWallet: p.feeWallet || addr, devBuySol: p.devBuySol, wallet: addr, mint: mintKp.publicKey.toBase58() });
      if (!prep.ok) throw new Error(prep.error);
      const plan: LaunchPlan = prep.plan;
      set(0, { state: "done" });

      const signStep = async (step: "create" | "split" | "buy", i: number, mintSigner?: Keypair) => {
        at = i; set(i, { state: "doing" });
        const t = await selfTxAction(plan, prep.ticket, step);
        if (!t.ok) throw new Error(t.error);
        const tx = VersionedTransaction.deserialize(Uint8Array.from(atob(t.tx), (c) => c.charCodeAt(0)));
        if (mintSigner) tx.sign([mintSigner]); // the mint signs first, then the wallet
        const signed = await w.signTransaction!(tx);
        let bin = ""; for (const b of signed.serialize()) bin += String.fromCharCode(b);
        const r = await selfRelayAction(plan, prep.ticket, step, btoa(bin));
        if (!r.ok) throw new Error(r.error);
        set(i, { state: "done", sig: r.sig });
        return r;
      };

      await signStep("create", 1, mintKp);
      const sp = await signStep("split", 2);
      if (sp.split && !sp.split.ok) throw new Error(`The token exists but the split did not verify: ${sp.split.problems.join(" ")}`);
      if (p.devBuySol > 0) await signStep("buy", 3); else set(3, { state: "done" });
      const msg = `Launched from your wallet. Token ${plan.mint} is live with the 70/30 split verified on-chain.`;
      setDone(msg); p.say(msg);
    } catch (e) {
      const m = e instanceof Error ? e.message : "Stopped.";
      set(at, { state: "fail" }); setErr(m); p.say(`Self launch stopped: ${m}`);
    }
    setBusy(false);
  };

  return (
    <div className="grid gap-3" data-testid="self-launch">
      <p className="text-sm">You pay the network fees and the dev buy from your own wallet. The platform never sees your key. The 70/30 split is set the same way and checked on-chain.</p>
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
      <button type="button" className="rk-btn rk-btn-mint" data-testid="self-go" disabled={!w.connected || !p.ready || busy || !!p.blockedReason} onClick={() => void run()}>
        {p.blockedReason ? "Self launch (blocked)" : busy ? "Waiting for your wallet…" : "Launch from my wallet"}
      </button>
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
