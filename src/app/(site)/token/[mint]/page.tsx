import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ExternalLink } from "lucide-react";
import { OwnerChecks } from "@/components/market/owner-checks";
import { ShareButton } from "@/components/market/share-button";
import { TokenLive } from "@/components/market/token-live";
import { TokenImage } from "@/components/market/token-card";
import { ToolHero } from "@/components/tools/tool-frame";
import { Composer } from "@/components/community/composer";
import { PostCard } from "@/components/community/post-card";
import { nowMs } from "@/components/market/format";
import { listPosts } from "@/lib/community/service";
import { sql } from "@/lib/db";
import { peekToken } from "@/lib/market/tokens";
import { isOwnerRequest } from "@/lib/owner";
import { siteUrl } from "@/lib/site";
import { isSolanaAddress } from "@/lib/tools/address";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function generateMetadata({ params }: PageProps<"/token/[mint]">): Promise<Metadata> {
  const { mint } = await params;
  const t = isSolanaAddress(mint) ? await peekToken(mint).catch(() => null) : null;
  if (!t) return { title: "Token", robots: { index: false, follow: false } };
  const title = `${t.name} ($${t.symbol})`;
  const description = (t.description || `${t.name} was launched through Rakaza. Live chart, trades and bonding curve progress.`).slice(0, 200);
  return {
    title,
    description,
    alternates: { canonical: `/token/${mint}` },
    openGraph: { type: "website", title: `${title} on Rakaza`, description, url: `/token/${mint}` },
    twitter: { card: "summary_large_image", title: `${title} on Rakaza`, description },
  };
}

const lnk = "inline-flex min-h-11 items-center gap-1.5 underline underline-offset-2";

export default async function Page({ params }: PageProps<"/token/[mint]">) {
  const { mint } = await params;
  if (!isSolanaAddress(mint)) notFound();
  const t = await peekToken(mint).catch(() => null);
  const owner = await isOwnerRequest().catch(() => false);

  if (!t) {
    // Not launched here. Visitors get a 404. The owner can still run the on-chain checks on any mint.
    if (!owner) notFound();
    return (
      <>
        <ToolHero kicker="Token" title="Token details" blurb="Not launched through Rakaza. Owner checks and market data only." />
        <section className="rk-container grid max-w-3xl grid-cols-[minmax(0,1fr)] gap-5 py-8 md:py-12">
          <p className="break-all font-mono text-xs opacity-80" data-testid="token-mint">{mint}</p>
          <Suspense fallback={<div className="rk-card text-sm">Running checks...</div>}><OwnerChecks mint={mint} withMarket /></Suspense>
        </section>
      </>
    );
  }

  const dev = t.network === "devnet";
  const cl = dev ? "?cluster=devnet" : "";
  const thread = sql() ? await listPosts({ mint, limit: 8 }).catch(() => null) : null;
  const now = nowMs();
  const shareText = `${t.name} ($${t.symbol}) on Rakaza: live chart and bonding curve. ${siteUrl()}/token/${mint}`;
  return (
    <>
      <ToolHero kicker={dev ? "Token · devnet" : "Token"} title={`$${t.symbol}`} blurb={t.name} />
      <section className="rk-container grid gap-5 py-8 md:py-12">
        <div className="rk-card grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)]">
          <TokenImage src={t.image} name={t.name} className="size-24 sm:size-28" />
          <div className="grid min-w-0 gap-3">
            <div>
              <h2 className="rk-h2 text-2xl">{t.name} <span className="opacity-70">${t.symbol}</span></h2>
              {t.description ? <p className="mt-1 max-w-3xl text-sm">{t.description}</p> : null}
              <p className="mt-2 break-all font-mono text-xs opacity-80" data-testid="token-mint">{mint}</p>
              <p className="mt-1 flex flex-wrap gap-2 text-[0.7rem] font-bold uppercase tracking-wide">
                <span className="rounded-full border border-[var(--rk-line)] px-2 py-0.5">{dev ? "Devnet" : "Mainnet"}</span>
                <span className="rounded-full border border-[var(--rk-line)] px-2 py-0.5">{t.mode === "agent" ? "Agent launch" : "Self launch"}</span>
              </p>
            </div>
            <nav aria-label="Token links" className="flex flex-wrap gap-x-4 text-sm">
              <a className={lnk} href={`https://explorer.solana.com/address/${mint}${cl}`} target="_blank" rel="noopener noreferrer">Explorer <ExternalLink className="size-3.5" aria-hidden="true" /></a>
              <a className={lnk} href={`https://solscan.io/token/${mint}${cl}`} target="_blank" rel="noopener noreferrer">Solscan <ExternalLink className="size-3.5" aria-hidden="true" /></a>
              {!dev ? <a className={lnk} href={t.links.pumpfun} target="_blank" rel="noopener noreferrer">pump.fun <ExternalLink className="size-3.5" aria-hidden="true" /></a> : null}
              {t.links.website ? <a className={lnk} href={t.links.website} target="_blank" rel="noopener noreferrer nofollow ugc">Website <ExternalLink className="size-3.5" aria-hidden="true" /></a> : null}
              {t.links.twitter ? <a className={lnk} href={t.links.twitter} target="_blank" rel="noopener noreferrer nofollow ugc">X <ExternalLink className="size-3.5" aria-hidden="true" /></a> : null}
              {t.links.telegram ? <a className={lnk} href={t.links.telegram} target="_blank" rel="noopener noreferrer nofollow ugc">Telegram <ExternalLink className="size-3.5" aria-hidden="true" /></a> : null}
            </nav>
            {dev ? <p className="text-xs opacity-80">This token is on Solana devnet, so pump.fun does not list it. Everything on this page is read from the chain.</p> : null}
            <ShareButton title={`${t.name} ($${t.symbol})`} text={shareText} />
          </div>
        </div>
        <TokenLive initial={t} />
        {owner ? <Suspense fallback={<div className="rk-card text-sm">Running owner checks...</div>}><OwnerChecks mint={mint} /></Suspense> : null}
        <section className="grid max-w-3xl gap-3" aria-labelledby="thread-h" data-testid="token-thread">
          <h2 id="thread-h" className="rk-h2 text-xl">Community thread</h2>
          <Composer mint={mint} defaultCategory="callouts" />
          {thread && thread.posts.length ? <ul className="grid gap-3">{thread.posts.map((p) => <PostCard key={p.id} p={p} now={now} />)}</ul> : <p className="text-sm opacity-80">No posts about this token yet.</p>}
        </section>
        <p className="text-xs opacity-70">Numbers come from the chain and our own trade index, refreshed every few seconds. Nothing here is financial advice.</p>
      </section>
    </>
  );
}
