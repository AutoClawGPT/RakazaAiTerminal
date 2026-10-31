/**
 * Rakaza live on SignalWire: pure config + SWML builder (no secrets returned, testable in node).
 * SignalWire's AI agent is the voice brain (STT, LLM, TTS). Our own VRM stage renders her and lip-syncs to the agent's audio.
 */
import { PERSONA } from "@/lib/brain/persona";

export type LiveEnv = Record<string, string | undefined>;

export const REQUIRED_ENV = ["SIGNALWIRE_PROJECT_ID", "SIGNALWIRE_SPACE_URL", "SIGNALWIRE_API_TOKEN", "SIGNALWIRE_AGENT_ADDRESS", "SIGNALWIRE_AGENT_ADDRESS_ID"] as const;

export type LiveConfig = { projectId: string; host: string; token: string; address: string; addressId: string };

/** "yourspace.signalwire.com" or "https://yourspace.signalwire.com/" -> "yourspace.signalwire.com" */
export function normalizeHost(v: string): string {
  return v.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "").toLowerCase();
}

export function missingEnv(env: LiveEnv): string[] {
  return REQUIRED_ENV.filter((k) => !env[k]?.trim());
}

export function readConfig(env: LiveEnv): LiveConfig | null {
  if (missingEnv(env).length) return null;
  const host = normalizeHost(env.SIGNALWIRE_SPACE_URL!);
  if (!/^[a-z0-9-]+\.signalwire\.com$/.test(host)) return null;
  return { projectId: env.SIGNALWIRE_PROJECT_ID!.trim(), host, token: env.SIGNALWIRE_API_TOKEN!.trim(), address: env.SIGNALWIRE_AGENT_ADDRESS!.trim(), addressId: env.SIGNALWIRE_AGENT_ADDRESS_ID!.trim() };
}

export const LIVE_ADDENDUM = `
You are LIVE on stream right now, speaking out loud. Viewers hear your voice and see your 3D avatar.
Keep every reply to one or two spoken sentences. Never read out links, wallet addresses or keys. Not financial advice.`;

/** SWML document served to SignalWire by /api/live/swml (a SWML webhook resource points there). */
export function rakazaSwml(opts: { voice?: string } = {}) {
  return {
    version: "1.0.0",
    sections: {
      main: [
        { answer: {} },
        {
          ai: {
            prompt: { text: PERSONA + LIVE_ADDENDUM, temperature: 0.7 },
            post_prompt: { text: "Summarize the conversation in two sentences." },
            params: { end_of_speech_timeout: 600, attention_timeout: 0 },
            languages: [{ name: "English", code: "en-US", voice: opts.voice || "rime.spore" }],
            SWAIG: { functions: [] },
          },
        },
      ],
    },
  };
}
