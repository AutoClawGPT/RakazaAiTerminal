"use server";
import { isOwnerRequest } from "@/lib/owner";
import { radarScan, type Lookalike } from "@/lib/launch/radar";
import { isSolanaAddress } from "@/lib/tools/address";

export async function radarAction(input: { mint?: string; name: string; ticker: string }): Promise<{ ok: true; found: Lookalike[]; checked: number } | { ok: false; error: string }> {
  if (!(await isOwnerRequest())) return { ok: false, error: "The scanner is for the owner and the agent only." };
  const mint = input.mint?.trim();
  if (mint && !isSolanaAddress(mint)) return { ok: false, error: "That mint address is not valid." };
  return radarScan({ mint: mint || undefined, name: String(input.name ?? "").slice(0, 60), ticker: String(input.ticker ?? "").slice(0, 20) });
}
