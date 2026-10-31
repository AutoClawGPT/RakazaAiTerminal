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
