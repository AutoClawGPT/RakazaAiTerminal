"use client";
import dynamic from "next/dynamic";
import Link from "next/link";

const SelfLaunchFlow = dynamic(() => import("./self-launch-flow").then((m) => m.SelfLaunchFlow), { ssr: false, loading: () => <p className="rk-card text-sm opacity-80">Loading wallet options…</p> });

/** Standalone Self launch tab: the full agent pipeline for a user who pays from their own wallet. It shares no wallet steps with the sponsored /launch tab. */
export function SelfLaunchPage({ network, treasury, enabled, feeUsd }: { network: "devnet" | "mainnet-beta"; treasury?: string; enabled: boolean; feeUsd: number }) {
  const fee = `$${feeUsd.toFixed(2)}`;
  return (
    <div className="grid gap-5" data-testid="self-launch-page">
      <div className="rk-card" data-testid="sl-what">
        <p className="rk-kicker">How it works</p>
        <ol className="mt-2 grid gap-1 text-sm">
          <li><b>1.</b> Connect Phantom or Solflare.</li>
          <li><b>2.</b> Paste the address of a token. The agent scans it, River studies it, and drafts your new token with an image on IPFS.</li>
          <li><b>3.</b> Edit anything, get a quote with the full cost breakdown, confirm, and approve once in your wallet.</li>
        </ol>
        <p className="mt-3 text-sm" data-testid="sl-fee-model">You are the creator and the token, the creator fees and the contract stay with <b>you</b>. <b>You keep 100% of the creator fees.</b> The platform takes one flat service fee of <b data-testid="sl-fee-usd">{fee}</b> (paid in SOL, quoted live and shown before you sign) on top of pump.fun&apos;s own launch cost. No percentage of your fees, no shareholder, no admin rights.</p>
        <p className="mt-2 text-xs opacity-80">Network: <b data-testid="sl-network">{network === "devnet" ? "Solana devnet (test coins, no real money)" : "Solana mainnet"}</b>. {network === "devnet" ? <>Set your wallet to devnet and get free test SOL at <a className="underline" href="https://faucet.solana.com" target="_blank" rel="noreferrer">faucet.solana.com</a>.</> : "Real SOL is used."}</p>
        {!enabled ? <p className="mt-2 text-sm text-amber-300" role="alert">Self launch is switched off on this server right now.</p> : null}
      </div>

      <SelfLaunchFlow network={network} treasury={treasury} enabled={enabled} />

      <div className="rk-card grid gap-2" data-testid="sl-faq">
        <p className="rk-kicker">Explain it to me (FAQ)</p>
        {[
          ["Who owns the token?", "You do. Your wallet is the creator and signs the launch. The platform has no admin rights, no mint authority and no way to move your token or your fees."],
          ["What does the platform get?", `One flat service fee of ${fee}, paid in SOL in the same transaction as the launch. You see the exact amount and the live conversion before you sign. It is never a share of your creator fees.`],
          ["What do I pay in total?", `pump.fun's own launch cost, the network fees, the ${fee} service fee and your optional dev buy. The quote shows every line and the total, and you confirm it before your wallet opens.`],
          ["Is the fee charged if the launch fails?", "No. The service fee and the token creation are one single transaction. If the token is not created, the fee is not paid either."],
          ["Is it safe?", "Your private key never leaves your wallet app, and the mint key is made in your browser. The server only builds the transaction, checks it (the service fee goes to the exact treasury address, the amount matches the quote, you are the creator), and forwards what you signed."],
          ["What is the vanity address option?", "You can grind a mint address that ends in pump (or anything you like) in your browser, or pick a key file. Download the key backup before you launch. The key never leaves your browser."],
          ["Why is my image generation limited?", "The platform pays for generated images, so each wallet gets a few per day. You can always upload your own picture, which is free and unlimited."],
          ["How is this different from the Launch tab?", "The Launch tab is the owner's sponsored agent launcher: the platform treasury agent wallet pays and the split is You 70% · Platform 30%. This tab is you launching from your own wallet and keeping everything."],
        ].map(([q, a]) => (
          <details key={q} className="text-sm"><summary className="cursor-pointer font-semibold">{q}</summary><p className="mt-1 opacity-90">{a}</p></details>
        ))}
        <p className="text-xs opacity-70">Not financial advice. Launching a coin is risky. <Link href="/terms" className="underline">Terms</Link></p>
      </div>
    </div>
  );
}
