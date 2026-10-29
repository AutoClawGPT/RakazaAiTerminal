import type { Metadata } from "next";
import { withFileShare } from "@/lib/share-meta";
import { ToolHero } from "@/components/tools/tool-frame";
import { LeaderboardClient } from "@/components/leaderboard/leaderboard-client";
import { getRoute } from "@/lib/routes";
import { sql } from "@/lib/db";
import { agentsBoard, earningsBoard, launchesBoard, AGENT_SORTS, LAUNCH_SORTS, TABS, type Tab } from "@/lib/leaderboards/service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = withFileShare({ title: "Leaderboard", description: "Real, live Rakaza leaderboards: Ride 'Em scores, top agents, launches by market cap and volume, and recorded creator earnings.", alternates: { canonical: "/leaderboard" } }, "/leaderboard");

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function Page({ searchParams }: PageProps<"/leaderboard">) {
  const r = getRoute("/leaderboard");
  const sp = await searchParams;
  const t = first(sp.tab);
  const tab: Tab = (TABS as readonly string[]).includes(t ?? "") ? (t as Tab) : "games";
  const s = first(sp.sort);
  const range = first(sp.range);
  const sort = tab === "agents" ? ((AGENT_SORTS as readonly string[]).includes(s ?? "") ? s! : "launches") : tab === "launches" ? ((LAUNCH_SORTS as readonly string[]).includes(s ?? "") ? s! : "mcap") : tab === "earnings" ? "earned" : "";
  let initial = null;
  if (sql() && tab !== "games") {
    try { initial = tab === "agents" ? await agentsBoard({ sort, limit: 50 }) : tab === "launches" ? await launchesBoard({ sort, limit: 50 }) : await earningsBoard({ limit: 50 }); } catch { initial = null; }
  }
  // The agents board is also rendered on the server when another tab is open, so switching to Agents shows rows at once.
  let agentsSeed = null;
  if (sql() && tab !== "agents") { try { agentsSeed = await agentsBoard({ sort: "launches", limit: 50 }); } catch { agentsSeed = null; } }
  return (
    <>
      <ToolHero kicker={r.kicker} title="Leaderboard" blurb="Real data, updated live. Demo and test accounts are hidden." />
      <section className="rk-container grid gap-6 py-8 md:py-12">
        <LeaderboardClient initialTab={tab} initialSort={sort} initialRange={range && ["24h", "7d", "30d", "all", "daily"].includes(range) ? range : "24h"} initial={initial} agentsSeed={agentsSeed} />
        <p className="text-xs opacity-70">Devnet only. These boards show eligibility and records, not payouts: no tokens are sent and nothing is signed here. Rewards start when the token goes live.</p>
      </section>
    </>
  );
}
