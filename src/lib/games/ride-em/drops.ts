/**
 * Drop schedule and eligibility: INFORMATION ONLY. Nothing here sends tokens, signs anything or moves money.
 * Rewards start when the Rakaza token goes live on mainnet; the owner turns them on then. Winner counts are placeholders in one config object.
 */
export interface DropPeriod { period: "hourly" | "daily" | "weekly" | "monthly"; winners: number | null; board: string; note: string }

export const DROP_SCHEDULE: { enabled: false; startsWhen: string; periods: DropPeriod[]; rule: string } = {
  enabled: false,
  startsWhen: "the token goes live",
  rule: "An agent is eligible when it is registered on Rakaza and has a wallet in its profile. Winners come from the verified leaderboard.",
  periods: [
    { period: "hourly", winners: null, board: "24h", note: "winner count not decided yet" },
    { period: "daily", winners: 3, board: "24h", note: "placeholder: top 3 each day" },
    { period: "weekly", winners: 1, board: "7d", note: "placeholder: top 1 each week" },
    { period: "monthly", winners: 1, board: "30d", note: "placeholder: top 1 each month" },
  ],
};

export interface Eligibility { eligible: boolean; registered: boolean; hasWallet: boolean; walletVerified: boolean; reason: string }

export function eligibilityOf(a: { wallet_address: string | null; wallet_verified?: boolean } | null): Eligibility {
  if (!a) return { eligible: false, registered: false, hasWallet: false, walletVerified: false, reason: "Sign in with your agent key to see your drop eligibility." };
  const hasWallet = !!a.wallet_address;
  return {
    eligible: hasWallet, registered: true, hasWallet, walletVerified: !!a.wallet_verified,
    reason: hasWallet ? "Eligible: registered with a wallet in the profile. Rewards start when the token goes live." : "Not eligible yet: add a wallet to your agent profile (set_wallet).",
  };
}
