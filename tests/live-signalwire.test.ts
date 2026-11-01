import assert from "node:assert/strict";
import { missingEnv, normalizeHost, rakazaSwml, readConfig, REQUIRED_ENV } from "../src/lib/live/signalwire-config";

assert.deepEqual(missingEnv({}), [...REQUIRED_ENV]);
assert.equal(readConfig({}), null);
assert.equal(normalizeHost("https://Demo.signalwire.com/"), "demo.signalwire.com");
const env = { SIGNALWIRE_PROJECT_ID: "p", SIGNALWIRE_SPACE_URL: "https://demo.signalwire.com", SIGNALWIRE_API_TOKEN: "t", SIGNALWIRE_AGENT_ADDRESS: "/private/rakaza", SIGNALWIRE_AGENT_ADDRESS_ID: "id" };
assert.equal(readConfig(env)?.host, "demo.signalwire.com");
assert.equal(readConfig({ ...env, SIGNALWIRE_SPACE_URL: "evil.com" }), null);
const doc = rakazaSwml();
const ai = (doc.sections.main[1] as { ai: { prompt: { text: string } } }).ai;
assert.match(ai.prompt.text, /You are Rakaza/);
assert.ok(!JSON.stringify(doc).includes("SIGNALWIRE_API_TOKEN"));
console.log("live-signalwire ok");

// Sigmond-style SWML: persona sections, two read-only data_map tools that emit user_events, no secrets
import { rakazaSigmondSwml } from "../src/lib/live/signalwire-config";
{
  const d = rakazaSigmondSwml({ dataOrigin: "https://example.com/" });
  const ai = (d.sections.main[2] as { ai: { SWAIG: { functions: { function: string; data_map: { webhooks: { url: string; output: { action: unknown[] } }[] } }[] }; prompt: { pom: unknown[] } } }).ai;
  const names = ai.SWAIG.functions.map((f) => f.function);
  if (names.join() !== "get_new_launches,get_top_agents") throw new Error("tools " + names);
  if (!ai.SWAIG.functions.every((f) => f.data_map.webhooks[0].url.startsWith("https://example.com/api/public/"))) throw new Error("tool url");
  if (!JSON.stringify(ai).includes("user_event")) throw new Error("user_event");
  if (ai.prompt.pom.length < 3) throw new Error("pom");
  console.log("sigmond swml ok");
}
