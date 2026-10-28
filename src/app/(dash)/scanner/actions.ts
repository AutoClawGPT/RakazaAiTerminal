"use server";
import { isOwnerRequest } from "@/lib/owner";
import { launchGuard } from "@/lib/launch/caller";
import { radarScan, type Lookalike } from "@/lib/launch/radar";
import { isSolanaAddress } from "@/lib/tools/address";
import { vampScan, type VampResult } from "@/lib/launch/vamp";

export async function radarAction(input: { mint?: string; name: string; ticker: string }): Promise<{ ok: true; found: Lookalike[]; checked: number } | { ok: false; error: string }> {
  if (!(await isOwnerRequest())) return { ok: false, error: "The scanner is for the owner and the agent only." };
  const mint = input.mint?.trim();
  if (mint && !isSolanaAddress(mint)) return { ok: false, error: "That mint address is not valid." };
  return radarScan({ mint: mint || undefined, name: String(input.name ?? "").slice(0, 60), ticker: String(input.ticker ?? "").slice(0, 20) });
}

/** Real Vamp Radar + Vamp Shield scan from just a token address (grindcore-style rows). */
export async function vampScanAction(mintRaw: string): Promise<{ ok: true; result: VampResult } | { ok: false; error: string }> {
  // Owner as before, or a signed-in agent on its own session (rate-limited): the sponsored Launch tab is open to every signed-in user.
  const g = await launchGuard("scan", { max: 20, n: 1, unit: "h" });
  if (g) return g;
  const mint = String(mintRaw ?? "").trim();
  if (!isSolanaAddress(mint)) return { ok: false, error: "That is not a valid Solana address." };
  try { return await vampScan(mint); } catch { return { ok: false, error: "The scan failed to run. Try again in a moment." }; }
}
