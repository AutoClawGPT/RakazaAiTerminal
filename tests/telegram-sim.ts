// Simulated Telegram updates against the real handlers. TELEGRAM_MOCK=1 means nothing is ever sent to Telegram:
// every outbound call is captured in globalThis.__tgOutbox and asserted on.
// Run: set -a; . ./.env.local; set +a; TELEGRAM_MOCK=1 NODE_OPTIONS="-r $PWD/tests/stub-so.cjs" npx tsx tests/telegram-sim.ts
import { handleUpdate, adminId, type Update } from "../src/lib/telegram/bot";
import { webhookSecret } from "../src/app/api/telegram/webhook/route";
import type { Outbound } from "../src/lib/telegram/api";

if (process.env.TELEGRAM_MOCK !== "1") throw new Error("Refusing to run without TELEGRAM_MOCK=1 (would message Telegram).");
delete process.env.EXECUTE_ENABLED; // the approve tap must hit the safety gate, not launch
const ADMIN = adminId();
if (!ADMIN) throw new Error("TELEGRAM_ADMIN_ID not set");
const box = () => (globalThis as unknown as { __tgOutbox: Outbound[] }).__tgOutbox ?? [];
let uid = 9_000_000 + Math.floor(Math.random() * 1_000_000);
const texts = (from: number) => box().slice(from).filter((o) => o.method === "sendMessage").map((o) => String(o.body?.text ?? ""));
let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`); };

async function say(text: string, from = ADMIN!) {
  const n = box().length;
  await handleUpdate({ update_id: ++uid, message: { message_id: uid, text, chat: { id: from, type: "private" }, from: { id: from } } } as Update);
  return n;
}
async function tap(data: string) {
  const n = box().length;
  await handleUpdate({ update_id: ++uid, callback_query: { id: String(uid), data, from: { id: ADMIN! }, message: { message_id: 1, chat: { id: ADMIN!, type: "private" } } } } as Update);
  return n;
}

async function main() {
// Webhook secret is a 48-hex HMAC derived from the bot token (value never printed).
check("webhook secret is derived and well formed", /^[0-9a-f]{48}$/.test(webhookSecret()));

// Strangers are refused.
let n = await say("/fees", ADMIN! + 1);
check("non-admin gets 'private' and nothing else", texts(n).length === 1 && /private/i.test(texts(n)[0]));

n = await say("/help");
check("/help lists the commands", /\/health/.test(texts(n).join("")) && /\/launch/.test(texts(n).join("")) && /\/voice/.test(texts(n).join("")));

n = await say("/health");
const h = texts(n).join("\n");
check("/health runs a real integrations check and reports counts", /Integrations on \w+: \d+ ok, \d+ missing, \d+ failed/.test(h), h.split("\n")[1] ?? "");
check("/health never prints a secret", !Object.entries(process.env).some(([k, v]) => /KEY|TOKEN|SECRET|PRIVATE/.test(k) && v && v.length > 12 && h.includes(v)));

n = await say("/fees");
const f = texts(n).join("\n");
check("/fees replies with the ledger", f.length > 10, f.split("\n")[0]);

n = await say("/distribute");
check("/distribute replies without sending (asks for a tap)", texts(n).length >= 1 && !box().slice(n).some((o) => o.method === "sendPhoto"), texts(n)[0]?.split("\n")[0]);

n = await tap("dist");
const d = texts(n).join("\n");
check("tapping 'Send fees now' runs the distributor and reports per mint", /Sending waiting fees/.test(d) && d.split("\n").length >= 2, d.split("\n").slice(1, 2).join(""));

// /voice toggle (state is restored to off at the end).
n = await say("/voice on");
check("/voice on", /on\./.test(texts(n).join("")));
n = await say("/voice off");
check("/voice off", /off/.test(texts(n).join("")));

// /launch: full prepare path up to the approval buttons, then Cancel, then Approve (blocked by the EXECUTE gate).
const MINT = "AQBTDs9tw2Qf1Mk2NGC6xyrHPpXDLZyh2xigsynzpump";
const FEEWALLET = "Eux7hEsTK1nhpNFfiSwCsiJuFFpWRJqBNu7ZjdD6wvpW";
n = await say("/launch");
check("/launch without args shows usage", /Usage: \/launch/.test(texts(n).join("")));
async function launchOnce() {
  const s = await say(`/launch ${MINT} ${FEEWALLET} 0`);
  const msgs = box().slice(s);
  const last = [...msgs].reverse().find((o) => o.method === "sendMessage" && o.body?.reply_markup);
  return { msgs, last };
}
const L = await launchOnce();
const kb = (L.last?.body?.reply_markup as { inline_keyboard: { text: string; callback_data: string }[][] } | undefined)?.inline_keyboard?.[0];
check("/launch reaches step 5 with Approve and Cancel buttons", !!kb && kb.length === 2 && /^ok:/.test(kb[0].callback_data) && /^no:/.test(kb[1].callback_data), texts(box().length - L.msgs.length).length ? "" : String(L.last?.body?.text ?? texts(box().length - L.msgs.length).slice(-1)[0] ?? "").split("\n")[0]);
check("/launch sent a preview image", L.msgs.some((o) => o.method === "sendPhoto"));
if (kb) {
  n = await tap(kb[0].callback_data);
  check("Approve with EXECUTE_ENABLED off does NOT launch", /switched off/.test(texts(n).join("")), texts(n).join(" | ").slice(0, 120));
  n = await tap(kb[0].callback_data);
  check("A used approval cannot be replayed", /expired or was already used/.test(texts(n).join("")));
  const L2 = await launchOnce();
  const kb2 = (L2.last?.body?.reply_markup as { inline_keyboard: { callback_data: string }[][] } | undefined)?.inline_keyboard?.[0];
  if (kb2) { n = await tap(kb2[1].callback_data); check("Cancel discards the approval", /Cancelled/.test(texts(n).join(""))); }
  else check("second /launch prepared", false);
}

console.log(`\n${pass} passed, ${fail} failed; outbound calls captured: ${box().length}, none sent to Telegram.`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error("sim crashed:", e instanceof Error ? e.message : e); process.exit(2); });
