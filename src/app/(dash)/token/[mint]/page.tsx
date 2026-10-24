import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ToolHero } from "@/components/tools/tool-frame";
import { fetchToken } from "@/lib/launch/token-fetch";
import { verifyLaunch } from "@/lib/api/chain-tools";
import { isSolanaAddress } from "@/lib/tools/address";
import { getEnv } from "@/lib/env";

export const metadata: Metadata = { title: "Token" };
export const dynamic = "force-dynamic";

const usd = (n?: number) => (n == null ? "not available" : n >= 1 ? `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : `$${n.toPrecision(3)}`);

export default async function Page({ params }: PageProps<"/token/[mint]">) {
  const { mint } = await params;
  if (!isSolanaAddress(mint)) notFound();
  const net = getEnv().NEXT_PUBLIC_SOLANA_NETWORK;
  const [meta, v] = await Promise.all([
    fetchToken(mint).catch(() => ({ ok: false as const, error: "Market data is unavailable." })),
    verifyLaunch(mint).catch((e: unknown) => ({ failed: e instanceof Error ? e.message : "Check failed." })),
  ]);
  const cluster = net === "devnet" ? "?cluster=devnet" : "";
  const ok = "checks" in v;
  return (
    <>
      <ToolHero kicker="Token" title={meta.ok && meta.token.name ? `${meta.token.name}${meta.token.symbol ? ` (${meta.token.symbol})` : ""}` : "Token details"} blurb="Live checks straight from the chain and our records. Nothing here is guessed." />
      <section className="rk-container grid max-w-3xl grid-cols-[minmax(0,1fr)] gap-5 py-8 md:py-12">
        <p className="break-all font-mono text-xs opacity-80" data-testid="token-mint">{mint} · {net}</p>
        <div className="rk-card">
          <h2 className="rk-h2 text-xl">Checks</h2>
          {ok ? (
            <>
              <p className="mt-2 text-sm font-semibold" data-testid="token-verdict">{v.ok ? "All checks passed." : "Some checks did not pass."}</p>
              <ul className="mt-3 grid gap-2 text-sm">{v.checks.map((c) => <li key={c.name} className="break-words rounded-xl bg-white/5 p-3"><b>{c.ok ? "Passed" : "Not passed"}:</b> {c.name}<br /><span className="break-all opacity-80">{c.detail}</span></li>)}</ul>
              {v.fees ? <p className="mt-3 text-sm">Fees waiting to be sent: {(v.fees.distributableLamports / 1e9).toFixed(6)} SOL ({v.fees.canDistribute ? "ready to send" : "below the minimum to send"}).</p> : null}
              {v.onChainShareholders?.length ? <ul className="mt-3 grid gap-1 text-sm">{v.onChainShareholders.map((s) => <li key={s.address} className="font-mono text-xs">{s.address.slice(0, 6)}…{s.address.slice(-6)}: {s.shareBps / 100}%</li>)}</ul> : null}
              <p className="mt-3 flex flex-wrap gap-3 text-sm"><a className="underline" href={`https://explorer.solana.com/address/${mint}${cluster}`} target="_blank" rel="noreferrer">Open on Solana Explorer</a>{v.txs.create ? <a className="underline" href={`https://explorer.solana.com/tx/${v.txs.create}${cluster}`} target="_blank" rel="noreferrer">Create transaction</a> : null}{v.txs.split ? <a className="underline" href={`https://explorer.solana.com/tx/${v.txs.split}${cluster}`} target="_blank" rel="noreferrer">Split transaction</a> : null}</p>
            </>
          ) : <p className="mt-2 text-sm text-red-400" role="alert">Could not run the checks: {"failed" in v ? v.failed : "unknown error"}</p>}
        </div>
        <div className="rk-card">
          <h2 className="rk-h2 text-xl">Market</h2>
          {meta.ok ? (
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div><dt className="rk-kicker">Price</dt><dd>{usd(meta.token.priceUsd)}</dd></div>
              <div><dt className="rk-kicker">Market cap</dt><dd>{usd(meta.token.marketCapUsd)}</dd></div>
              <div><dt className="rk-kicker">Liquidity</dt><dd>{usd(meta.token.liquidityUsd)}</dd></div>
              <div><dt className="rk-kicker">24h volume</dt><dd>{usd(meta.token.volume24hUsd)}</dd></div>
            </dl>
          ) : <p className="mt-2 text-sm opacity-80">{meta.error}</p>}
        </div>
      </section>
    </>
  );
}
