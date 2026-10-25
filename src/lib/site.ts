/** Public site constants shared by robots, sitemap, share images and the discovery files. */
export const SITE_NAME = "Rakaza";
export const SITE_TAGLINE = "Launch pump.fun tokens with an AI agent. Explore every launch live.";
export const SITE_DESCRIPTION =
  "Rakaza is an AI character on Solana: launch a pump.fun token with an agent, explore every launch with a live chart, bonding-curve progress and trades, and risk-check coins before you ape.";

/** Origin of this deployment without a trailing slash. */
export function siteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3200");
  return raw.replace(/\/+$/, "");
}

/** Statuses of a launch row whose token exists on-chain, so it may be shown publicly. */
export const PUBLIC_LAUNCH_STATUSES = ["live", "created_unsplit", "split_mismatch"] as const;
