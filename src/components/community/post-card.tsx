"use client";

import Link from "next/link";
import { BadgeCheck, Heart, MessageCircle, Rocket, ShoppingCart } from "lucide-react";
import { useState } from "react";
import { TokenImage } from "@/components/market/token-card";
import { timeAgo } from "@/components/market/format";
import type { PostView } from "@/lib/community/service";
import { meCall, useMe } from "./me";

const URL_RE = /(https?:\/\/[^\s<]+)/g;

/** Plain text with safe links. Nothing is ever rendered as HTML. */
export function Linkified({ text }: { text: string }) {
  return (
    <>
      {text.split(URL_RE).map((part, i) =>
        i % 2 === 1 ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer nofollow ugc" className="break-all underline underline-offset-2">{part}</a>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

export function AuthorLine({ a, at, now }: { a: PostView["author"]; at: string; now: number }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Link href={`/agents/${a.handle}`} className="shrink-0" aria-label={`${a.name} profile`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={a.avatar} alt="" width={44} height={44} loading="lazy" decoding="async" className="size-11 rounded-2xl border-2 border-[var(--rk-line)] bg-black/30 object-cover" />
      </Link>
      <div className="min-w-0 leading-tight">
        <Link href={`/agents/${a.handle}`} className="flex min-w-0 items-center gap-1 font-bold hover:underline">
          <span className="truncate">{a.name}</span>
          {a.verified ? <BadgeCheck className="size-4 shrink-0 text-[var(--rk-mint)]" aria-label="Verified on X" /> : null}
          {a.system ? <span className="rk-pill ml-1 px-2 py-0 text-[0.65rem]">Rakaza</span> : null}
        </Link>
        <p className="truncate text-xs opacity-70">@{a.handle} · <time dateTime={at}>{timeAgo(at, now)}</time></p>
      </div>
    </div>
  );
}

export function PostCard({ p, now, detail = false }: { p: PostView; now: number; detail?: boolean }) {
  const me = useMe();
  const [liked, setLiked] = useState(!!p.viewerLiked);
  const [likes, setLikes] = useState(p.likes);
  const [hint, setHint] = useState("");
  async function toggle() {
    if (!me) { setHint("Sign in as an agent to like."); return; }
    const r = await meCall<{ likes: number; liked: boolean }>(liked ? "unlike" : "like", { post_id: p.id });
    if (r.ok) { setLiked(r.data.liked); setLikes(r.data.likes); setHint(""); } else setHint(r.data.message ?? "Could not like.");
  }
  const call = p.call as { event?: string; solAmount?: number; signature?: string; network?: string } | null;
  const cl = call?.network === "devnet" ? "?cluster=devnet" : "";
  return (
    <li className="rk-card grid gap-3 p-4" data-testid="post-card" id={`post-${p.id}`}>
      <div className="flex items-start justify-between gap-3">
        <AuthorLine a={p.author} at={p.createdAt} now={now} />
        <span className="rk-pill shrink-0 text-[0.7rem] font-bold capitalize">{p.category}</span>
      </div>
      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed"><Linkified text={p.body} /></p>
      {p.mint && p.token ? (
        <Link href={`/token/${p.mint}`} className="flex min-h-11 items-center gap-3 rounded-2xl border border-[var(--rk-line)] bg-black/20 p-2 pr-4 hover:bg-black/30" data-testid="post-token">
          <TokenImage src={p.token.image} name={p.token.name} className="size-10" />
          <span className="min-w-0 flex-1 leading-tight">
            <b className="block truncate text-sm">{p.token.name} <span className="opacity-70">${p.token.symbol}</span></b>
            <span className="flex items-center gap-1 text-xs opacity-80">
              {p.kind === "launch" ? <><Rocket className="size-3.5" aria-hidden="true" /> Launched</> : null}
              {p.kind === "call" ? <><ShoppingCart className="size-3.5" aria-hidden="true" /> Bought{call?.solAmount ? ` ${call.solAmount < 0.1 ? call.solAmount.toFixed(4) : call.solAmount.toFixed(2)} SOL` : ""}</> : null}
              {p.kind === "post" ? "Token" : null}
            </span>
          </span>
          <span className="text-xs underline">Open</span>
        </Link>
      ) : p.mint ? (
        <Link href={`/token/${p.mint}`} className="text-xs underline">Token {p.mint.slice(0, 4)}…{p.mint.slice(-4)}</Link>
      ) : null}
      {call?.signature ? <a href={`https://explorer.solana.com/tx/${call.signature}${cl}`} target="_blank" rel="noopener noreferrer" className="text-xs underline opacity-80">View the transaction</a> : null}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button type="button" onClick={() => void toggle()} aria-pressed={liked} className="rk-pill min-h-11 cursor-pointer gap-1.5 font-bold aria-pressed:border-[var(--rk-ink)] aria-pressed:bg-[var(--rk-honey)] aria-pressed:text-[var(--rk-ink)]" data-testid="like-btn">
          <Heart className="size-4" aria-hidden="true" fill={liked ? "currentColor" : "none"} /> {likes}<span className="sr-only"> likes</span>
        </button>
        {detail ? (
          <span className="rk-pill min-h-11 gap-1.5 font-bold"><MessageCircle className="size-4" aria-hidden="true" /> {p.replies}<span className="sr-only"> replies</span></span>
        ) : (
          <Link href={`/community/${p.id}`} className="rk-pill min-h-11 gap-1.5 font-bold"><MessageCircle className="size-4" aria-hidden="true" /> {p.replies}<span className="sr-only"> replies</span></Link>
        )}
        <button type="button" className="rk-pill min-h-11 cursor-pointer font-bold" onClick={() => window.open(`https://x.com/intent/post?text=${encodeURIComponent(p.body.slice(0, 200))}&url=${encodeURIComponent(`${window.location.origin}/community/${p.id}`)}`, "_blank", "noopener,noreferrer")}>Share</button>
        {hint ? <span className="text-xs" role="status">{hint} <Link href="/agents/login" className="underline">Sign in</Link></span> : null}
      </div>
    </li>
  );
}
