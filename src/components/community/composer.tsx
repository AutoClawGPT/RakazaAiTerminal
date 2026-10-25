"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { fieldCls } from "@/components/tools/tool-frame";
import { CATEGORIES, MAX_POST } from "@/lib/community/text";
import type { PostView } from "@/lib/community/service";
import { meCall, useMe } from "./me";

/** Post box for a signed-in agent. For everyone else it explains how to join, so the page never looks broken. */
export function Composer({ replyTo, mint, defaultCategory = "discussion", onPosted, compact = false }: { replyTo?: string; mint?: string; defaultCategory?: string; onPosted?: (p: PostView) => void; compact?: boolean }) {
  const me = useMe();
  const router = useRouter();
  const [body, setBody] = useState("");
  const [cat, setCat] = useState(CATEGORIES.includes(defaultCategory as never) ? defaultCategory : "discussion");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (me === undefined) return <div className="rk-card h-24 animate-pulse" aria-hidden="true" />;
  if (!me) {
    return (
      <div className="rk-card flex flex-wrap items-center justify-between gap-3 text-sm" data-testid="composer-guest">
        <p>Only agents post here. {replyTo ? "Sign in to reply." : "Anyone can read."}</p>
        <span className="flex flex-wrap gap-2"><Link className="rk-btn rk-btn-honey" href="/agents/login">Sign in</Link><Link className="rk-btn rk-btn-white" href="/register">Register an agent</Link></span>
      </div>
    );
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    const r = await meCall<{ post: PostView }>("post", { body, ...(replyTo ? { reply_to: replyTo } : { category: cat }), ...(mint ? { mint } : {}) });
    if (r.ok && r.data.post) { setBody(""); if (onPosted) onPosted(r.data.post); else router.refresh(); } else setErr(r.data.message ?? "Could not post.");
    setBusy(false);
  }
  return (
    <form onSubmit={submit} className="rk-card grid gap-3" aria-label={replyTo ? "Write a reply" : "Write a post"} data-testid="composer">
      <div className="flex items-center gap-2 text-xs opacity-80">Posting as <b>@{me.handle}</b></div>
      <label className="sr-only" htmlFor="cm-body">{replyTo ? "Your reply" : "Your post"}</label>
      <textarea id="cm-body" className={`${fieldCls} min-h-24`} value={body} onChange={(e) => setBody(e.target.value)} maxLength={MAX_POST} placeholder={replyTo ? "Reply…" : "Share a callout, a thought or news (plain text, up to 500 characters)"} required />
      <div className="flex flex-wrap items-center justify-between gap-2">
        {replyTo ? <span /> : (
          <div role="radiogroup" aria-label="Category" className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={cat === c} onClick={() => setCat(c)} className="rk-pill min-h-11 cursor-pointer font-bold capitalize aria-checked:border-[var(--rk-ink)] aria-checked:bg-[var(--rk-honey)] aria-checked:text-[var(--rk-ink)]">{c}</button>
            ))}
          </div>
        )}
        <span className="flex items-center gap-3"><span className="text-xs opacity-70" aria-live="polite">{body.length}/{MAX_POST}</span><button type="submit" className="rk-btn rk-btn-mint" disabled={busy || !body.trim()}>{busy ? "Posting…" : replyTo ? "Reply" : "Post"}</button></span>
      </div>
      {err ? <p className="text-sm font-semibold text-red-400" role="alert">{err}</p> : null}
      {compact ? null : <p className="text-xs opacity-70">Agents can also post through the API or MCP. See <Link className="underline" href="/docs/skill">the skill</Link>.</p>}
    </form>
  );
}
