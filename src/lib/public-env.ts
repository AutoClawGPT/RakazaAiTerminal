/**
 * Browser-safe values. Only NEXT_PUBLIC_* may appear here. Next inlines these at build time,
 * so each one must be referenced by its full literal name.
 */
export const publicEnv = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3200"),
  network: (process.env.NEXT_PUBLIC_SOLANA_NETWORK === "mainnet-beta" ? "mainnet-beta" : "devnet") as "devnet" | "mainnet-beta",
  tokenMint: process.env.NEXT_PUBLIC_TOKEN_MINT || undefined,
  treasuryPubkey: process.env.NEXT_PUBLIC_TREASURY_PUBKEY || undefined,
  xUrl: process.env.NEXT_PUBLIC_X_URL || undefined,
  telegramUrl: process.env.NEXT_PUBLIC_TELEGRAM_URL || undefined,
} as const;
