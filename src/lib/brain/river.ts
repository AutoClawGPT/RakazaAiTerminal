import "server-only";
import { getEnv } from "@/lib/env";

export type ChatMsg = { role: "system" | "user" | "assistant"; content: string };

export const PERSONA_MODEL_DEFAULT = "deepseek-ai/DeepSeek-V4.1-Flash";

type Opts = { key?: "persona" | "agent"; model?: string; maxTokens?: number; temperature?: number; timeoutMs?: number; attempts?: number };

/** OpenAI-compatible chat call to River with a timeout and two retries (River sometimes times out once). */
export async function riverChat(messages: ChatMsg[], opts: Opts = {}): Promise<{ ok: true; text: string; model: string } | { ok: false; error: string }> {
  const e = getEnv();
  const apiKey = opts.key === "agent" ? e.RIVER_AGENT : e.RIVER_RAKAZO ?? e.RIVER_AGENT;
  if (!apiKey) return { ok: false, error: "River key is not set on the server." };
  const model = opts.model ?? (opts.key === "agent" ? e.RIVER_MODEL_AGENT : e.RIVER_MODEL_PERSONA) ?? PERSONA_MODEL_DEFAULT;
  let lastErr = "unknown error";
  for (let attempt = 0; attempt < Math.max(1, opts.attempts ?? 3); attempt++) {
    try {
      const res = await fetch(`${e.RIVER_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ model, messages, max_tokens: opts.maxTokens ?? 300, temperature: opts.temperature ?? 0.8 }),
        signal: AbortSignal.timeout(opts.timeoutMs ?? 25_000),
        cache: "no-store",
      });
      if (!res.ok) {
        lastErr = `River returned ${res.status}`;
        if (res.status < 500 && res.status !== 429) break;
        continue;
      }
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const text = data.choices?.[0]?.message?.content?.trim();
      if (text) return { ok: true, text, model };
      lastErr = "River returned an empty reply";
    } catch (err) {
      lastErr = err instanceof Error ? err.message : "request failed";
    }
  }
  return { ok: false, error: lastErr };
}
