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

/** Sigmond-style SWAIG data_map tool: SignalWire itself fetches our PUBLIC read-only API, speaks the answer, and pushes a user_event to the browser (Live Wire panel). No secrets, no writes. */
function feedTool(name: string, purpose: string, url: string, response: string, event: Record<string, unknown>) {
  return {
    function: name,
    description: purpose,
    parameters: { type: "object", properties: {} },
    data_map: {
      webhooks: [
        {
          url,
          method: "GET",
          output: {
            response,
            action: [{ SWML: { version: "1.0.0", sections: { main: [{ user_event: { event: { type: "tool_result", tool: name, ...event } } }] } } }],
          },
        },
      ],
      output: { response: "The platform data is unavailable right now. Say so briefly." },
    },
  };
}

/**
 * Rakaza in the bobbystable / Sigmond pattern: prompt sections (POM), a language entry, real SWAIG tools,
 * a post_prompt and user_events the browser turns into avatar states, captions and the Live Wire panel.
 * `dataOrigin` must be a public https origin SignalWire can reach (the production app).
 */
export function rakazaSigmondSwml(opts: { voice?: string; dataOrigin?: string } = {}) {
  const o = (opts.dataOrigin || "https://rakaza-ai-terminal.vercel.app").replace(/\/$/, "");
  return {
    version: "1.0.0",
    sections: {
      main: [
        { answer: {} },
        { user_event: { event: { type: "agent_ready", agent: "rakaza" } } },
        {
          ai: {
            prompt: {
              temperature: 0.7,
              pom: [
                { title: "Role", body: PERSONA },
                { title: "Live show", body: LIVE_ADDENDUM.trim() },
                {
                  title: "Tools",
                  bullets: [
                    "When asked about new launches, tokens or what is happening on the platform, call get_new_launches and say the newest name in one sentence.",
                    "When asked about top or best agents or the leaderboard, call get_top_agents.",
                    "Everything is devnet test data. Never give financial advice.",
                  ],
                },
                { title: "Greeting", body: "Open with a short, upbeat hello as Rakaza, the live 3D host, and invite one question." },
              ],
            },
            post_prompt: { text: "Summarize the conversation in two sentences." },
            params: { end_of_speech_timeout: 600, attention_timeout: 0, swaig_allow_swml: true },
            languages: [{ name: "English", code: "en-US", voice: opts.voice || "rime.spore" }],
            SWAIG: {
              functions: [
                feedTool("get_new_launches", "Get the newest token launches on the Rakaza platform (devnet).", `${o}/api/public/tokens?limit=3`, "Newest launches: %{tokens[0].name} (%{tokens[0].symbol}), then %{tokens[1].name} and %{tokens[2].name}. Devnet test data.", { name: "%{tokens[0].name}", symbol: "%{tokens[0].symbol}" }),
                feedTool("get_top_agents", "Get the top agents on the Rakaza leaderboard (devnet).", `${o}/api/public/leaderboard/agents?limit=3`, "Top agents: 1 %{rows[0].name} with %{rows[0].launches} launches, 2 %{rows[1].name}, 3 %{rows[2].name}.", { name: "%{rows[0].name}", launches: "%{rows[0].launches}" }),
              ],
            },
          },
        },
      ],
    },
  };
}
