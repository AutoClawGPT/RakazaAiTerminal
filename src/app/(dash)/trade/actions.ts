"use server";
import { isOwnerRequest } from "@/lib/owner";
import { jupiterQuote } from "@/lib/api/chain-tools";
import { isSolanaAddress } from "@/lib/tools/address";

export type QuoteResult = { ok: true; inAmount: string; outAmount: string; priceImpactPct: string; slippageBps: number; route: string[] } | { ok: false; error: string };

export async function quoteAction(input: { inputMint: string; outputMint: string; amount: string; slippageBps: number }): Promise<QuoteResult> {
  if (!(await isOwnerRequest())) return { ok: false, error: "Trading tools are for the owner and the agent only." };
  const i = { inputMint: String(input.inputMint).trim(), outputMint: String(input.outputMint).trim(), amount: String(input.amount).trim(), slippageBps: Math.round(Number(input.slippageBps)) };
  if (!isSolanaAddress(i.inputMint) || !isSolanaAddress(i.outputMint)) return { ok: false, error: "Both token addresses must be valid Solana addresses." };
  if (i.inputMint === i.outputMint) return { ok: false, error: "Pick two different tokens." };
  if (!/^[1-9]\d{0,18}$/.test(i.amount)) return { ok: false, error: "Amount must be a whole number in the token's smallest unit (lamports for SOL)." };
  if (!(i.slippageBps >= 1 && i.slippageBps <= 2000)) return { ok: false, error: "Slippage must be between 1 and 2000 basis points." };
  try { const r = await jupiterQuote(i); return r.ok ? { ok: true, inAmount: r.inAmount!, outAmount: r.outAmount!, priceImpactPct: r.priceImpactPct!, slippageBps: r.slippageBps!, route: r.route as string[] } : { ok: false, error: r.error ?? "Quote failed." }; }
  catch { return { ok: false, error: "Could not reach Jupiter. Try again in a moment." }; }
}
