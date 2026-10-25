"use client";
import { useMemo, useState } from "react";
import { ConnectionProvider, WalletProvider, useWallet } from "@solana/wallet-adapter-react";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { LaunchFlow } from "@/components/launch/launch-flow";
import type { LaunchApi } from "@/components/launch/launch-api";
import { SelfStage } from "@/components/launch/self-stage";
import { publicAnalyzeAction, publicImageAction, publicPinAction, publicRiskAction, publicScanAction } from "@/app/(site)/self-launch/actions";

/** Public wiring of the shared launch pipeline. Every call is rate-limited on the server; the image call is also limited per wallet. */
function makeApi(wallet: string): LaunchApi {
  return {
    scan: publicScanAction,
    analyze: publicAnalyzeAction,
    risk: publicRiskAction,
    image: (prompt) => publicImageAction(prompt, wallet),
    pin: publicPinAction,
  };
}

function Inner({ network, treasury, enabled }: { network: "devnet" | "mainnet-beta"; treasury?: string; enabled: boolean }) {
  const w = useWallet();
  const [connErr, setConnErr] = useState("");
  const addr = w.publicKey?.toBase58() ?? "";
  const api = useMemo(() => makeApi(addr), [addr]);
  const wallet = useMemo(() => (w.publicKey && w.signTransaction ? { address: addr, signTransaction: w.signTransaction } : null), [w.publicKey, w.signTransaction, addr]);
  const choices = w.wallets.filter((x) => x.adapter.name === "Phantom" || x.adapter.name === "Solflare");

  return (
    <div className="grid gap-5">
      <div className="rk-card grid gap-3" data-testid="sl-wallet">
        <p className="rk-kicker">1 · Connect your wallet</p>
        {!w.connected ? (
          <>
            <p className="text-sm">Connect Phantom or Solflare first. Your wallet is the creator of the token and pays for the launch. The platform never sees your key and never signs for you.</p>
            <div className="flex flex-wrap gap-2">
              {choices.map((x) => (
                <button key={x.adapter.name} type="button" className="rk-btn rk-btn-honey" data-testid={`connect-${x.adapter.name.toLowerCase()}`} disabled={w.connecting}
                  onClick={async () => { try { setConnErr(""); w.select(x.adapter.name); await x.adapter.connect(); } catch (e) { setConnErr(e instanceof Error && e.message ? e.message : "Could not connect the wallet."); } }}>
                  Connect {x.adapter.name}{x.readyState === "NotDetected" ? " (not detected)" : ""}
                </button>
              ))}
            </div>
            {connErr ? <p className="text-sm text-red-400" role="alert">{connErr}</p> : null}
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <p className="break-all">Connected: <span className="font-mono text-xs" data-testid="self-addr">{addr}</span></p>
            <button type="button" className="rk-btn rk-btn-white rk-btn-sm" onClick={() => void w.disconnect()}>Disconnect</button>
          </div>
        )}
      </div>
      <LaunchFlow variant="self" api={api} network={network} treasury={treasury} canRun={w.connected && enabled}
        runHint={!enabled ? "Self launch is switched off on this server right now." : "Connect your wallet first, then the agent can start."}
        stage={(ctx) => <SelfStage ctx={ctx} wallet={wallet} enabled={enabled} />} />
    </div>
  );
}

export function SelfLaunchFlow(p: { network: "devnet" | "mainnet-beta"; treasury?: string; enabled: boolean }) {
  const wallets = useMemo(() => [new PhantomWalletAdapter(), new SolflareWalletAdapter()], []);
  return (
    <ConnectionProvider endpoint={p.network === "devnet" ? "https://api.devnet.solana.com" : "https://api.mainnet-beta.solana.com"}>
      <WalletProvider wallets={wallets} autoConnect={false}><Inner {...p} /></WalletProvider>
    </ConnectionProvider>
  );
}
