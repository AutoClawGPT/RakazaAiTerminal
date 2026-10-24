"use server";
import { isOwnerRequest } from "@/lib/owner";
import { fetchToken, type TokenInfo } from "@/lib/launch/token-fetch";
import { optimizeToken, type Draft } from "@/lib/launch/optimize";
import { generateImage } from "@/lib/pollinations";

type Fail = { ok: false; error: string };

async function guard(): Promise<Fail | null> {
  return (await isOwnerRequest()) ? null : { ok: false, error: "The launch tools are for the owner and the agent only." };
}

export async function scanTokenAction(mint: string): Promise<{ ok: true; token: TokenInfo } | Fail> {
  const g = await guard();
  if (g) return g;
  return fetchToken(String(mint ?? ""));
}

export async function draftAction(token: TokenInfo): Promise<{ ok: true; draft: Draft } | Fail> {
  const g = await guard();
  if (g) return g;
  if (!token || typeof token.mint !== "string") return { ok: false, error: "Scan a token first." };
  // Re-fetch on the server so the browser cannot feed the brain forged facts.
  const fresh = await fetchToken(token.mint);
  if (!fresh.ok) return fresh;
  return { ok: true, draft: await optimizeToken(fresh.token) };
}

export async function imageAction(prompt: string): Promise<{ ok: true; dataUrl: string; ms: number } | Fail> {
  const g = await guard();
  if (g) return g;
  const p = String(prompt ?? "").trim();
  if (p.length < 5) return { ok: false, error: "Write an image prompt first." };
  const r = await generateImage(p, { size: "512x512" });
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, dataUrl: `data:${r.mime};base64,${r.b64}`, ms: r.ms };
}
