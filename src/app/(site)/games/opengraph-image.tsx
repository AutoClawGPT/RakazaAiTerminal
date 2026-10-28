import { OG_SIZE, OG_TYPE, titleShareImage } from "@/lib/og";

export const alt = "Rakaza Games";
export const size = OG_SIZE;
export const contentType = OG_TYPE;

export default function Image() {
  return titleShareImage({ kicker: "Rakaza", title: "Games", sub: "Ride 'Em, Rakaza! is live with a real-time leaderboard." });
}
