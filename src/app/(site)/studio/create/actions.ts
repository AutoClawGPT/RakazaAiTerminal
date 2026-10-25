"use server";

import { isOwnerRequest } from "@/lib/owner";
import { generateImage } from "@/lib/pollinations";

export type StudioResult = { ok: true; dataUrl: string; ms: number; model: string } | { ok: false; error: string };

const STYLE: Record<string, string> = {
  design: "Original character design sheet, full figure, clean flat illustration, bold colors, plain background, no text",
  picture: "Original illustration, vivid colors, high detail, no text, no watermark",
  logo: "Original coin mascot logo, flat vector, bold colors, centered, plain background, no text",
};

// Light per-process throttle on top of the owner check: one image every 4 seconds.
let last = 0;

/** Owner-only image generation for the Studio tab (Pollinations FLUX Schnell). The platform key stays on the server. */
export async function studioGenerateAction(input: { prompt: string; mode?: string; size?: "512x512" | "1024x1024" }): Promise<StudioResult> {
  if (!(await isOwnerRequest())) return { ok: false, error: "Owner sign-in required." };
  const p = String(input?.prompt ?? "").trim();
  if (p.length < 5) return { ok: false, error: "Describe what to draw (at least a few words)." };
  if (p.length > 600) return { ok: false, error: "Keep the description under 600 characters." };
  if (Date.now() - last < 4000) return { ok: false, error: "One image at a time. Wait a few seconds." };
  last = Date.now();
  const style = STYLE[input.mode ?? "picture"] ?? STYLE.picture;
  const size = input.size === "1024x1024" ? "1024x1024" : "512x512";
  try {
    const r = await generateImage(`${style}. ${p}`, { size });
    if (!r.ok) return { ok: false, error: r.error };
    return { ok: true, dataUrl: `data:${r.mime};base64,${r.b64}`, ms: r.ms, model: r.model };
  } catch {
    return { ok: false, error: "The image service did not answer. Try again in a moment." };
  }
}
