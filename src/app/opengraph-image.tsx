import { OG_SIZE, OG_TYPE, siteShareImage } from "@/lib/og";

export const alt = "Rakaza: launch pump.fun tokens with an AI agent and explore every launch live";
export const size = OG_SIZE;
export const contentType = OG_TYPE;
/** Re-rendered every 5 minutes so the launch counter stays fresh. */
export const revalidate = 300;

export default function Image() {
  return siteShareImage();
}
