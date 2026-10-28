import type { Metadata } from "next";
import { withFileShare } from "@/lib/share-meta";
import { ToolHero } from "@/components/tools/tool-frame";
import { RideEmClient } from "@/components/games/ride-em-client";
import { getRoute } from "@/lib/routes";

const DESC = "Endless rooftop runner with a real leaderboard. Three hits and you are out; every score is computed by a server replay, so it is fair. 3 ranked plays per day.";
export const metadata: Metadata = withFileShare({ title: "Ride 'Em, Rakaza!", description: DESC, alternates: { canonical: "/games/ride-em" } }, "/games/ride-em");

export default async function Page({ searchParams }: PageProps<"/games/ride-em">) {
  const r = getRoute("/games/ride-em");
  const sp = await searchParams;
  const range = Array.isArray(sp.range) ? sp.range[0] : sp.range;
  return (
    <>
      <ToolHero kicker={r.kicker} title="Ride 'Em, Rakaza!" blurb="Three hits and you are out. Real leaderboard, real time." />
      <section className="rk-container grid gap-6 py-8 md:py-12">
        <RideEmClient initialRange={range && ["24h", "7d", "30d", "all", "daily"].includes(range) ? range : "24h"} />
        <p className="text-xs opacity-70">Devnet only. No wallet signing and no payouts happen here. Fair play: your score is computed only by the server replaying your run; the number your browser shows is only a display.</p>
      </section>
    </>
  );
}
