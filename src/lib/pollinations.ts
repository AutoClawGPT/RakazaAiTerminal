import "server-only";
import { getEnv } from "./env";

const BASE = "https://gen.pollinations.ai";

export type PollinationsResult =
  | { ok: true; mime: "image/png"; b64: string; ms: number; model: string }
  | { ok: false; status: number; error: string };

/** One image (FLUX family). The key goes only in the Authorization header. */
export async function generateImage(
  prompt: string,
  opts: { size?: "512x512" | "1024x1024"; keyOverride?: string; model?: string } = {},
): Promise<PollinationsResult> {
  const key = opts.keyOverride ?? getEnv().POLLINATIONS_API_KEY;
  if (!key) return { ok: false, status: 0, error: "POLLINATIONS_API_KEY is not set" };
  const model = opts.model ?? getEnv().POLLINATIONS_IMAGE_MODEL;
  const t0 = Date.now();
  try {
    const res = await fetch(`${BASE}/v1/images/generations`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt: prompt.slice(0, 1500), size: opts.size ?? "1024x1024", n: 1 }),
      signal: AbortSignal.timeout(60_000),
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, status: res.status, error: res.status === 401 || res.status === 403 ? "Pollinations rejected the key" : `Pollinations error ${res.status} ${body.slice(0, 120)}` };
    }
    const json = (await res.json()) as { data?: { b64_json?: string }[] };
    const b64 = json.data?.[0]?.b64_json;
    if (!b64) return { ok: false, status: res.status, error: "No image in response" };
    return { ok: true, mime: "image/png", b64, ms: Date.now() - t0, model };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : "request failed" };
  }
}

/** Free key check: reads the account balance. */
export async function checkBalance(keyOverride?: string): Promise<{ ok: true; balance: number } | { ok: false; error: string }> {
  const key = keyOverride ?? getEnv().POLLINATIONS_API_KEY;
  if (!key) return { ok: false, error: "POLLINATIONS_API_KEY is not set" };
  try {
    const res = await fetch(`${BASE}/account/balance`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000), cache: "no-store" });
    if (res.status === 401 || res.status === 403) return { ok: false, error: "Pollinations rejected the key" };
    if (!res.ok) return { ok: false, error: `Pollinations error ${res.status}` };
    const j = (await res.json()) as { balance?: number };
    return { ok: true, balance: Number(j.balance ?? 0) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "request failed" };
  }
}
