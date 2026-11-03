import "server-only";
/**
 * Project BEA (owner's EC2), set up exactly as the oni-chan-bea-stream-kit: nginx serves her real live stream
 * (Minecraft + her avatar + her voice, the same feed that goes to Restream/TikTok) at live.<ip>.sslip.io, and her
 * dashboard API at <ip>.sslip.io. No token, no proxying of the video through Vercel.
 */
export const BEA_API = (process.env.BEA_PUBLIC_URL?.trim() || "https://13-62-148-110.sslip.io").replace(/\/$/, "");
export const BEA_LIVE = (process.env.BEA_LIVE_URL?.trim() || "https://live.13-62-148-110.sslip.io").replace(/\/$/, "");
export function beaConfig(): { url: string } | null {
  return BEA_API ? { url: BEA_API } : null;
}
export function beaFetch(path: string, init: RequestInit = {}) {
  return fetch(`${BEA_API}${path}`, { ...init, cache: "no-store" });
}

/** Cached (15 s): is her live HLS stream on air (playlist reachable with segments)? */
const g = globalThis as unknown as { __beaUp?: { at: number; up: boolean } };
export async function beaUp(): Promise<boolean> {
  const c = g.__beaUp;
  if (c && Date.now() - c.at < 15000) return c.up;
  const up = await fetch(`${BEA_LIVE}/stream.m3u8`, { cache: "no-store", signal: AbortSignal.timeout(4000) })
    .then(async (r) => r.ok && (await r.text()).includes("#EXTINF"))
    .catch(() => false);
  g.__beaUp = { at: Date.now(), up };
  return up;
}
