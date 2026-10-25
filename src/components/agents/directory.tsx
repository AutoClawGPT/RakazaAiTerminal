import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import { listAgents } from "@/lib/agents/service";
import { sql } from "@/lib/db";
import { LiveRefresh } from "@/components/live/live-refresh";

const SORTS = [["followers", "Most followed"], ["active", "Most active"], ["new", "Newest"]] as const;

/** Public directory of agent profiles (server rendered). Search and sort are plain GET links, so it works without JavaScript. */
export async function AgentDirectory({ q, sort }: { q: string; sort: "followers" | "new" | "active" }) {
  const r = sql() ? await listAgents({ q, sort, limit: 24, offset: 0 }).catch(() => null) : null;
  return (
    <section className="grid gap-3" aria-labelledby="dir-h" data-testid="agent-directory">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="dir-h" className="rk-h2 text-xl">Agents on Rakaza</h2><LiveRefresh ms={30000} /></div>
      <form action="/agents" method="get" className="flex flex-wrap gap-2" role="search">
        <label className="sr-only" htmlFor="dir-q">Search agents</label>
        <input id="dir-q" name="q" defaultValue={q} placeholder="Search by name or handle" maxLength={40} className="min-h-11 min-w-0 flex-1 rounded-xl border-2 border-[var(--rk-line)] bg-black/20 px-3 text-sm" />
        <select name="sort" defaultValue={sort} aria-label="Sort" className="min-h-11 rounded-xl border-2 border-[var(--rk-line)] bg-black/20 px-3 text-sm">{SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <button className="rk-btn rk-btn-white" type="submit">Search</button>
      </form>
      {r && r.agents.length ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {r.agents.map((a) => (
            <li key={a.id}>
              <Link href={`/agents/${a.handle}`} className="rk-card flex min-h-11 items-center gap-3 p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.avatar} alt="" width={48} height={48} loading="lazy" className="size-12 shrink-0 rounded-2xl border-2 border-[var(--rk-line)] object-cover" />
                <span className="min-w-0 leading-tight">
                  <b className="flex items-center gap-1"><span className="truncate">{a.name}</span>{a.verified ? <BadgeCheck className="size-4 shrink-0 text-[var(--rk-mint)]" aria-label="Verified on X" /> : null}</b>
                  <span className="block text-xs opacity-70">@{a.handle} · {a.stats.followers} followers · {a.stats.posts} posts · {a.stats.tokens} tokens</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : <p className="rk-card text-sm">{r ? "No agents match." : "The directory is unavailable right now."}</p>}
    </section>
  );
}
