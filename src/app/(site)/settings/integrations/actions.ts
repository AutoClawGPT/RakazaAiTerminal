"use server";

import { isOwnerRequest } from "@/lib/owner";
import { checkBalance, generateImage } from "@/lib/pollinations";

export type KeyActionResult = {
  ok: boolean;
  message: string;
  balance?: number;
  imageB64?: string;
};

/** Owner-only health check of the platform's own Pollinations key (set in the server environment). No key is ever accepted from the browser. */
export async function testPollinations(withImage: boolean): Promise<KeyActionResult> {
  if (!(await isOwnerRequest())) return { ok: false, message: "Owner only." };
  const bal = await checkBalance();
  if (!bal.ok) return { ok: false, message: bal.error };
  if (!withImage) return { ok: true, message: "Key accepted.", balance: bal.balance };
  const img = await generateImage("Original coin mascot logo, flat vector, bold colors, centered, no text", { size: "512x512" });
  if (!img.ok) return { ok: false, message: img.error, balance: bal.balance };
  return { ok: true, message: `Image made in ${(img.ms / 1000).toFixed(1)}s with ${img.model}.`, balance: bal.balance, imageB64: img.b64 };
}
