import "server-only";

/** Thin Telegram Bot API client. The token is read from the environment and never logged. */
const token = () => process.env.TELEGRAM_BOT_TOKEN ?? "";
const url = (m: string) => `https://api.telegram.org/bot${token()}/${m}`;

export type Button = { text: string; callback_data: string };

/**
 * Mock mode for tests: with TELEGRAM_MOCK=1 nothing leaves the machine. Every outbound call is recorded in
 * `globalThis.__tgOutbox` instead of going to Telegram (text, photo, voice and button calls alike).
 */
export type Outbound = { method: string; body?: Record<string, unknown> };
export const isMock = () => process.env.TELEGRAM_MOCK === "1";
function record(o: Outbound) {
  const g = globalThis as unknown as { __tgOutbox?: Outbound[] };
  (g.__tgOutbox ??= []).push(o);
}

export async function tg(method: string, body?: Record<string, unknown>): Promise<{ ok: boolean; result?: unknown; description?: string }> {
  if (isMock()) { record({ method, body }); return { ok: true, result: {} }; }
  try {
    const res = await fetch(url(method), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}), signal: AbortSignal.timeout(30_000), cache: "no-store" });
    return (await res.json()) as { ok: boolean; result?: unknown; description?: string };
  } catch {
    return { ok: false, description: "Could not reach Telegram." };
  }
}

export async function sendText(chat: number, text: string, buttons?: Button[][]) {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += 3800) chunks.push(text.slice(i, i + 3800));
  for (let i = 0; i < chunks.length; i++) {
    await tg("sendMessage", { chat_id: chat, text: chunks[i], disable_web_page_preview: true, ...(buttons && i === chunks.length - 1 ? { reply_markup: { inline_keyboard: buttons } } : {}) });
  }
}

export async function sendPhoto(chat: number, bytes: Uint8Array, caption: string) {
  const fd = new FormData();
  fd.set("chat_id", String(chat));
  fd.set("caption", caption.slice(0, 1000));
  fd.set("photo", new Blob([Buffer.from(bytes)], { type: "image/png" }), "token.png");
  if (isMock()) { record({ method: "sendPhoto", body: { chat_id: chat, caption, bytes: bytes.length } }); return; }
  try {
    await fetch(url("sendPhoto"), { method: "POST", body: fd, signal: AbortSignal.timeout(30_000) });
  } catch { /* the text reply still goes out */ }
}

const FEMALE = new Set(["luna", "aurora", "phoebe", "thalia", "amalthea", "iris", "asteria", "athena", "hera", "andromeda", "callista", "cora", "delia", "electra", "harmonia", "helena", "juno", "minerva", "ophelia", "pandora", "selene", "theia", "vesta", "celeste", "estrella"]);
function voiceName() {
  const m = /^aura-2-([a-z]+)-en$/.exec(process.env.RAKAZA_VOICE ?? "");
  return m && FEMALE.has(m[1]) ? `aura-2-${m[1]}-en` : "aura-2-luna-en";
}

/** Rakaza's reply as a Telegram voice note (Deepgram Aura-2, the same Luna voice as the site). Returns false if voice is unavailable. */
export async function sendVoice(chat: number, text: string): Promise<boolean> {
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) return false;
  if (isMock()) { record({ method: "sendVoice", body: { chat_id: chat, text: text.slice(0, 600), voice: voiceName() } }); return true; }
  try {
    const r = await fetch(`https://api.deepgram.com/v1/speak?model=${voiceName()}&encoding=opus&container=ogg`, {
      method: "POST", headers: { authorization: `Token ${key}`, "content-type": "application/json" }, body: JSON.stringify({ text: text.slice(0, 600) }), signal: AbortSignal.timeout(30_000), cache: "no-store",
    });
    if (!r.ok) return false;
    const audio = new Uint8Array(await r.arrayBuffer());
    const fd = new FormData();
    fd.set("chat_id", String(chat));
    fd.set("voice", new Blob([Buffer.from(audio)], { type: "audio/ogg" }), "rakaza.ogg");
    const up = await fetch(url("sendVoice"), { method: "POST", body: fd, signal: AbortSignal.timeout(30_000) });
    return up.ok;
  } catch {
    return false;
  }
}
