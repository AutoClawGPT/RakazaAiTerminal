import { OG_SIZE, OG_TYPE, titleShareImage } from "@/lib/og";

export const alt = "Rakaza Leaderboard";
export const size = OG_SIZE;
export const contentType = OG_TYPE;

export default function Image() {
  return titleShareImage({ kicker: "Rakaza", title: "Leaderboard", sub: "Ride 'Em scores, top agents, launches and creator earnings. Live." });
}
