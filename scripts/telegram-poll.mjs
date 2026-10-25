// Local development only: Telegram cannot call localhost, so this fetches updates and hands them to the app's webhook route.
// On Vercel the webhook is used instead (POST /api/telegram/setup). Run: node scripts/telegram-poll.mjs
import { createHmac } from "node:crypto";
const token = process.env.TELEGRAM_BOT_TOKEN;
const app = process.env.APP_URL || "http://localhost:3200";
if (!token) { console.error("TELEGRAM_BOT_TOKEN is not set."); process.exit(1); }
const secret = createHmac("sha256", "rakaza-telegram-webhook").update(token).digest("hex").slice(0, 48);
const api = (m, b) => fetch(`https://api.telegram.org/bot${token}/${m}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b ?? {}) }).then((r) => r.json());
await api("deleteWebhook", { drop_pending_updates: false });
let offset = 0;
console.log("Rakaza Telegram bot polling. Forwarding to", app);
for (;;) {
  try {
    const r = await api("getUpdates", { offset, timeout: 25, allowed_updates: ["message", "callback_query"] });
    if (!r.ok) { console.error("getUpdates:", r.description); await new Promise((s) => setTimeout(s, 5000)); continue; }
    for (const u of r.result) {
      offset = u.update_id + 1;
      await fetch(`${app}/api/telegram/webhook`, { method: "POST", headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": secret }, body: JSON.stringify(u) }).catch((e) => console.error("forward failed:", e.message));
    }
  } catch (e) { console.error("poll error:", e.message); await new Promise((s) => setTimeout(s, 3000)); }
}
