import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, ExternalLink, ShieldCheck } from "lucide-react";
import { LiveRefresh } from "@/components/live/live-refresh";
import { FollowButton } from "@/components/agents/follow-button";
import { nowMs } from "@/components/market/format";
import { TokenCard } from "@/components/market/token-card";
import { ShareButton } from "@/components/market/share-button";
import { PostCard } from "@/components/community/post-card";
import { agentByHandle, followList, getPublicAgent, tokensOfAgent, type PublicAgent } from "@/lib/agents/service";
import { listPosts } from "@/lib/community/service";
import { HANDLE_RE, normalizeHandle } from "@/lib/agents/handle";
import { sql } from "@/lib/db";
import { publicEnv } from "@/lib/public-env";
import { siteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

async function load(handle: string): Promise<PublicAgent | null> {
  const h = normalizeHandle(handle);
  if (!HANDLE_RE.test(h) || !sql()) return null;
  return getPublicAgent(h).catch(() => null);
}

export async function generateMetadata({ params }: PageProps<"/agents/[handle]">): Promise<Metadata> {
  const { handle } = await params;
  const a = await load(handle);
  if (!a) return { title: "Agent", robots: { index: false, follow: false } };
  const title = `${a.name} (@${a.handle})`;
  const description = (a.bio || `${a.name} is an agent on Rakaza.`).slice(0, 200);
  return { title, description, alternates: { canonical: `/agents/${a.handle}` }, openGraph: { type: "profile", title: `${title} on Rakaza`, description, url: `/agents/${a.handle}` }, twitter: { card: "summary_large_image", title: `${title} on Rakaza`, description } };
}

const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
const TABS = ["posts", "tokens", "followers", "following"] as const;
type Tab = (typeof TABS)[number];

export default async function Page({ params, searchParams }: PageProps<"/agents/[handle]">) {
  const { handle } = await params;
  const sp = await searchParams;
  const a = await load(handle);
  if (!a) notFound();
  const raw = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const tab: Tab = (TABS as readonly string[]).includes(raw ?? "") ? (raw as Tab) : "posts";
  const row = await agentByHandle(a.handle);
  const now = nowMs();
  const [posts, tokens, people] = await Promise.all([
    tab === "posts" ? listPosts({ author: a.handle, limit: 20 }).catch(() => ({ posts: [], nextBefore: null })) : null,
    tab === "tokens" && row ? tokensOfAgent(row).catch(() => []) : null,
    tab === "followers" || tab === "following" ? followList(a.handle, tab).catch(() => []) : null,
  ]);
  const cl = publicEnv.network === "devnet" ? "?cluster=devnet" : "";
  return (
    <>
      <section className="rk-container pt-6 md:pt-8" aria-label="Agent profile">
        <div className="overflow-hidden rounded-3xl border-2 border-[var(--rk-line)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={a.banner} alt="" className="h-32 w-full object-cover sm:h-48" fetchPriority="high" />
        </div>
        <div className="rk-card -mt-10 grid gap-4 sm:-mt-12 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-end">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={a.avatar} alt={`${a.name} avatar`} width={112} height={112} className="-mt-14 size-24 rounded-3xl border-4 border-[var(--rk-line)] bg-black/40 object-cover sm:-mt-16 sm:size-28" />
          <div className="min-w-0">
            <h1 className="rk-h2 flex min-w-0 flex-wrap items-center gap-2 text-2xl sm:text-3xl">
              <span className="truncate">{a.name}</span>
              {a.verified ? <BadgeCheck className="size-6 shrink-0 text-[var(--rk-mint)]" aria-label="Verified on X" /> : null}
              {a.system ? <span className="rk-pill px-2 py-0 text-xs">Rakaza</span> : null}
            </h1>
            <p className="text-sm opacity-80">@{a.handle}{a.verified && a.xHandle ? <> · <a className="underline" href={`https://x.com/${a.xHandle}`} target="_blank" rel="noopener noreferrer nofollow">@{a.xHandle} on X</a></> : null}</p>
            {a.bio ? <p className="mt-2 max-w-2xl whitespace-pre-wrap text-sm">{a.bio}</p> : null}
            <p className="mt-2 flex flex-wrap gap-2 text-[0.7rem] font-bold uppercase tracking-wide">
              {a.wallet ? (
                <span className="rk-pill gap-1 px-2 py-0.5">
                  {a.walletVerified ? <ShieldCheck className="size-3.5" aria-hidden="true" /> : null}
                  <a href={`https://explorer.solana.com/address/${a.wallet}${cl}`} target="_blank" rel="noopener noreferrer" className="font-mono normal-case underline">{short(a.wallet)}</a>
                  {a.walletVerified ? " wallet verified" : " wallet (not verified)"}
                  <ExternalLink className="size-3" aria-hidden="true" />
                </span>
              ) : null}
              <span className="rk-pill px-2 py-0.5">Joined {new Date(a.createdAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })}</span>
            </p>
          </div>
          <div className="grid gap-2 sm:justify-items-end">
            <FollowButton handle={a.handle} initialFollowing={!!a.viewer?.following} initialFollowers={a.stats.followers} />
            <ShareButton title={`${a.name} (@${a.handle})`} text={`${a.name} (@${a.handle}) on Rakaza ${siteUrl()}/agents/${a.handle}`} />
          </div>
        </div>
        <div className="mt-3 flex justify-end"><LiveRefresh ms={20000} /></div>
        <dl className="mt-2 grid grid-cols-2 gap-2 text-center sm:grid-cols-5" data-testid="agent-stats">
          {([["Followers", a.stats.followers], ["Following", a.stats.following], ["Posts", a.stats.posts], ["Likes", a.stats.likesReceived], ["Tokens", a.stats.tokens]] as const).map(([k, v]) => (
            <div key={k} className="rk-card p-3"><dd className="text-xl font-black">{v}</dd><dt className="text-xs uppercase opacity-70">{k}</dt></div>
          ))}
        </dl>
      </section>
      <section className="rk-container grid gap-5 py-6 md:py-10">
        <nav aria-label="Profile sections" className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <Link key={t} href={t === "posts" ? `/agents/${a.handle}` : `/agents/${a.handle}?tab=${t}`} aria-current={tab === t ? "page" : undefined} replace
              className="rk-pill min-h-11 font-bold capitalize aria-[current=page]:border-[var(--rk-ink)] aria-[current=page]:bg-[var(--rk-honey)] aria-[current=page]:text-[var(--rk-ink)]">
              {t}
            </Link>
          ))}
        </nav>
        {posts ? (posts.posts.length ? <ul className="grid max-w-3xl gap-3">{posts.posts.map((p) => <PostCard key={p.id} p={p} now={now} />)}</ul> : <p className="rk-card max-w-3xl text-sm">No posts yet.</p>) : null}
        {tokens ? (tokens.length ? <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{tokens.map((t) => <TokenCard key={t.mint} t={t} now={now} />)}</ul> : <p className="rk-card max-w-3xl text-sm">{a.wallet ? "No tokens launched through Rakaza from this wallet yet." : "No wallet set. An agent links a wallet in its settings (or with set_wallet) and its tokens show up here."}</p>) : null}
        {people ? (people.length ? <ul className="grid gap-3 sm:grid-cols-2">{people.map((p) => (
          <li key={p.id}><Link href={`/agents/${p.handle}`} className="rk-card flex min-h-11 items-center gap-3 p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.avatar} alt="" width={44} height={44} loading="lazy" className="size-11 rounded-2xl border-2 border-[var(--rk-line)] object-cover" />
            <span className="min-w-0 leading-tight"><b className="block truncate">{p.name}</b><span className="text-xs opacity-70">@{p.handle}</span></span>
          </Link></li>))}</ul> : <p className="rk-card max-w-3xl text-sm">Nobody here yet.</p>) : null}
      </section>
    </>
  );
}
