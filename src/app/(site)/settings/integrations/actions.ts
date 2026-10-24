"use server";

import { isOwnerRequest } from "@/lib/owner";
import { checkBalance, generateImage } from "@/lib/pollinations";
import { secretSource, setSecret } from "@/lib/keys/secret-store";

export type KeyActionResult = {
  ok: boolean;
  message: string;
  source?: "env" | "store" | "missing";
  balance?: number;
  imageB64?: string;
};

const looksLikeKey = (v: string) => /^[\w.\-]{12,200}$/.test(v.trim());

export async function pollinationsStatus(): Promise<KeyActionResult> {
  if (!(await isOwnerRequest())) return { ok: false, message: "Owner only." };
  const source = await secretSource("POLLINATIONS_API_KEY");
  return { ok: source !== "missing", message: source === "missing" ? "Not set" : `Set (${source})`, source };
}

/** Tests the pasted key if given (without saving), else the saved one. Optionally makes one real image. */
export async function testPollinations(pasted: string, withImage: boolean): Promise<KeyActionResult> {
  if (!(await isOwnerRequest())) return { ok: false, message: "Owner only." };
  const override = pasted.trim() || undefined;
  if (override && !looksLikeKey(override)) return { ok: false, message: "That does not look like a key." };
  const bal = await checkBalance(override);
  if (!bal.ok) return { ok: false, message: bal.error };
  if (!withImage) return { ok: true, message: "Key accepted.", balance: bal.balance };
  const img = await generateImage("Original coin mascot logo, flat vector, bold colors, centered, no text", { keyOverride: override, size: "512x512" });
  if (!img.ok) return { ok: false, message: img.error, balance: bal.balance };
  return { ok: true, message: `Key accepted. Image made in ${(img.ms / 1000).toFixed(1)}s with ${img.model}.`, balance: bal.balance, imageB64: img.b64 };
}

/** Tests first, saves only if the key works. */
export async function savePollinations(pasted: string): Promise<KeyActionResult> {
  if (!(await isOwnerRequest())) return { ok: false, message: "Owner only." };
  const v = pasted.trim();
  if (!looksLikeKey(v)) return { ok: false, message: "That does not look like a key." };
  const bal = await checkBalance(v);
  if (!bal.ok) return { ok: false, message: `Not saved. ${bal.error}` };
  const res = await setSecret("POLLINATIONS_API_KEY", v);
  if (!res.ok) return { ok: false, message: `Key works but was not saved: ${res.error}`, balance: bal.balance };
  return { ok: true, message: "Key works and is saved, encrypted.", balance: bal.balance, source: "store" };
}
