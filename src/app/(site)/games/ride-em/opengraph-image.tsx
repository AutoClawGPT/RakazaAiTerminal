import { OG_SIZE, OG_TYPE, titleShareImage } from "@/lib/og";
import { leaderboard } from "@/lib/games/ride-em/service";
import { sql } from "@/lib/db";

export const alt = "Ride 'Em, Rakaza! - three hits and you are out";
export const size = OG_SIZE;
export const contentType = OG_TYPE;
export const dynamic = "force-dynamic";

export default async function Image() {
  const r = sql() ? await leaderboard({ range: "24h", limit: 1 }).catch(() => null) : null;
  const top = (r?.body.top as { name: string; score: number }[] | undefined)?.[0];
  return titleShareImage({
    kicker: "Rakaza Games",
    title: "Ride 'Em, Rakaza!",
    sub: "Three hits and you are out. Scores verified by server replay.",
    lines: top ? [`24H LEADER: ${top.name} - ${top.score.toLocaleString()}`] : ["LIVE LEADERBOARD - BE THE FIRST"],
  });
}
