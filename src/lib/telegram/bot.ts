import "server-only";
import { getEnv } from "@/lib/env";
import { isSolanaAddress } from "@/lib/tools/address";
import { fetchToken } from "@/lib/launch/token-fetch";
import { optimizeToken } from "@/lib/launch/optimize";
import { generateImage } from "@/lib/pollinations";
import { executeSponsoredLaunch, resumeSplit } from "@/lib/launch/execute";
import { openBytes } from "@/lib/launch/seal";
import { isExecuteEnabled } from "@/lib/execute-gate";
import { buildLedger } from "@/lib/launch/ledger";
import { distributeAll } from "@/lib/launch/distribute";
import { callTool, TOOLS } from "@/lib/api/tools";
import { riverChat, type ChatMsg } from "@/lib/brain/river";
import { PERSONA } from "@/lib/brain/persona";
import { AGENT_KNOWLEDGE } from "@/lib/brain/knowledge";
import { sendText, sendPhoto, sendVoice, tg } from "./api";
import { getKey, putKey, delKey } from "./pending";
import { prepareSponsored, type Prepared } from "./prepare";

/* Telegram control room for the Rakaza launcher agent. Only the admin's private chat is served. */

type Msg = { message_id: number; text?: string; chat: { id: number; type: string }; from?: { id: number } };
type Cb = { id: string; data?: string; from: { id: number }; message?: Msg };
export type Update = { update_id: number; message?: Msg; callback_query?: Cb };

const OWNER = { kind: "owner" } as const;
const sol = (l: number) => `${(l / 1e9).toFixed(6)} SOL`;
const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
const cluster = () => (getEnv().NEXT_PUBLIC_SOLANA_NETWORK === "devnet" ? "?cluster=devnet" : "");
const txLink = (s: string) => `https://solscan.io/tx/${s}${cluster()}`;
const tokLink = (m: string) => `https://solscan.io/token/${m}${cluster()}`;

export function adminId(): number | null {
  const n = Number(process.env.TELEGRAM_ADMIN_ID ?? "");
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

const seen: number[] = [];
const history = new Map<number, ChatMsg[]>();
async function voiceOn(): Promise<boolean> { return (await getKey<boolean>("voice")) === true; }

const HELP = `Rakaza launcher control room (${"devnet/mainnet follows the platform network"}). Only you can use me.

/status  treasury, network and switches
/health  real check of every integration (keys never shown)
/balance [wallet]  SOL balance (treasury by default)
/scan <mint>  full scan of a token
/draft <mint>  my improved take on a token
/wallet <address>  save the wallet that gets the 70% fees
/launch <mint> [feeWallet] [devBuySol]  scan, draft, image, prepare, then ask for your tap
/launches  recent launches
/fees  fees waiting and sent, per wallet
/distribute  send waiting fees now (asks for your tap)
/verify <mint>  check a launch on-chain
/lookalikes <name> <ticker>  Vamp Radar scan
/voice on|off  voice notes (off by default)
/tools  everything I can do
/how  how I am built

Or just talk to me and I answer with a voice note.`;

/* eslint-disable @typescript-eslint/no-explicit-any */
async function tool(name: string, input: Record<string, unknown> = {}): Promise<{ ok: true; result: Record<string, any> } | { ok: false; message: string }> {
  const r = await callTool(name, input, OWNER);
  return r.ok ? { ok: true, result: r.result as Record<string, any> } : { ok: false, message: r.message };
}

async function savedWallet(): Promise<string | null> { return getKey<string>("wallet"); }

function firstArgs(text: string) {
  const parts = text.trim().split(/\s+/).slice(1);
  const addrs = parts.filter(isSolanaAddress);
  const nums = parts.filter((p) => /^\d+(\.\d+)?$/.test(p) && !isSolanaAddress(p));
  const words = parts.filter((p) => !isSolanaAddress(p) && !/^\d+(\.\d+)?$/.test(p));
  return { parts, addrs, nums, words };
}

async function cmdStatus(chat: number) {
  const [info, health] = await Promise.all([tool("platform_info"), tool("treasury_health")]);
  const lines: string[] = [];
  if (info.ok) lines.push(`Network: ${info.result.network}`, `Treasury: ${info.result.treasury ?? "not set"}`, `Launching: ${info.result.launchExecution}`);
  if (health.ok) {
    const h = health.result;
    lines.push(`Treasury balance: ${typeof h.balanceSol === "number" ? h.balanceSol.toFixed(4) + " SOL" : "unknown"}`, `Signing key ready: ${h.signerReady ?? h.keyReady ?? "see /tools"}`, `RPC: ${h.rpc?.ok === false ? "problem" : "ok"}`);
  } else lines.push(`Treasury check failed: ${health.message}`);
  await sendText(chat, lines.join("\n"));
}

async function cmdHealth(chat: number) {
  await sendText(chat, "Checking every integration with a real call…");
  const r = await tool("integrations_health");
  if (!r.ok) return sendText(chat, `Health check failed: ${r.message}`);
  const h = r.result as { network: string; counts: { ok: number; missing: number; failed: number }; rows: { label: string; status: string; detail: string; ms: number; envNames: string[] }[] };
  const mark: Record<string, string> = { ok: "OK", missing: "MISSING", failed: "FAILED" };
  await sendText(chat, [`Integrations on ${h.network}: ${h.counts.ok} ok, ${h.counts.missing} missing, ${h.counts.failed} failed`, ...h.rows.map((x) => `${mark[x.status] ?? x.status}  ${x.label}: ${x.detail}${x.status === "ok" ? ` (${x.ms} ms)` : x.envNames.length ? ` [${x.envNames.join(", ")}]` : ""}`)].join("\n"));
}

async function cmdBalance(chat: number, text: string) {
  const { addrs } = firstArgs(text);
  const w = addrs[0] ?? getEnv().TREASURY_PUBKEY;
  if (!w) return sendText(chat, "Give me a wallet address.");
  const r = await tool("wallet_balance", { wallet: w });
  await sendText(chat, r.ok ? `${w}\n${typeof r.result.sol === "number" ? r.result.sol.toFixed(6) : JSON.stringify(r.result)} SOL (${getEnv().NEXT_PUBLIC_SOLANA_NETWORK})` : r.message);
}

async function cmdScan(chat: number, mint: string, withDraft: boolean) {
  const t = await fetchToken(mint);
  if (!t.ok) return sendText(chat, t.error);
  const k = t.token;
  const [rug, auth] = await Promise.all([tool("rugcheck_token", { mint }), tool("token_authorities", { mint })]);
  const lines = [`${k.name} (${k.symbol})`, tokLink(k.mint), k.description ? `About: ${k.description.slice(0, 200)}` : "", k.priceUsd != null ? `Price: $${k.priceUsd}` : "", k.marketCapUsd != null ? `Market cap: $${Math.round(k.marketCapUsd).toLocaleString()}` : "", k.liquidityUsd != null ? `Liquidity: $${Math.round(k.liquidityUsd).toLocaleString()}` : "", k.ageHours != null ? `Age: ${k.ageHours.toFixed(1)} h` : "", `Pump.fun coin: ${k.isPump ? "yes" : "no"}`, `Sources: ${k.sources.join(", ")}`, ...k.warnings.map((w) => `Warning: ${w}`)].filter(Boolean);
  if (auth.ok) lines.push(`Authorities: ${JSON.stringify(auth.result).slice(0, 220)}`);
  if (rug.ok) lines.push(`Rugcheck: ${JSON.stringify(rug.result).slice(0, 220)}`);
  await sendText(chat, lines.join("\n"));
  if (withDraft) {
    const d = await optimizeToken(k);
    await sendText(chat, `My improved take${d.fromRiver ? "" : " (template, River was unavailable)"}:\nName: ${d.name}\nTicker: ${d.ticker}\nDescription: ${d.description}\nImage idea: ${d.imagePrompt}\nWhy: ${d.notes}\n\nTo launch it: /launch ${mint} <your fee wallet>`);
  }
}

async function cmdLaunch(chat: number, text: string) {
  const { addrs, nums } = firstArgs(text);
  const mint = addrs[0];
  if (!mint) return sendText(chat, "Usage: /launch <token mint> [fee wallet] [dev buy SOL]\nSave your fee wallet once with /wallet <address>.");
  const feeWallet = addrs[1] ?? (await savedWallet());
  if (!feeWallet) return sendText(chat, "Which wallet gets the 70% fees? Send /wallet <address> or add it after the mint.");
  const devBuy = nums[0] ? Number(nums[0]) : 0;

  await sendText(chat, "Step 1 of 5: checking the fee wallet.");
  const trust = await tool("trust_check", { wallet: feeWallet });
  if (!trust.ok) return sendText(chat, `Stopped: ${trust.message}`);
  if (!trust.result.normalWallet) return sendText(chat, `Stopped. That fee wallet does not look like a normal wallet:\n${trust.result.notes.join("\n")}`);
  if (trust.result.notes.length) await sendText(chat, `Note: ${trust.result.notes.join(" ")}`);

  await sendText(chat, "Step 2 of 5: scanning the token and writing my version.");
  const t = await fetchToken(mint);
  if (!t.ok) return sendText(chat, `Stopped: ${t.error}`);
  const d = await optimizeToken(t.token);
  await sendText(chat, `${d.name} (${d.ticker})\n${d.description}\nWhy: ${d.notes}`);

  await sendText(chat, "Step 3 of 5: creating the image.");
  const img = await generateImage(d.imagePrompt, { size: "512x512" });
  if (!img.ok) return sendText(chat, `Stopped: image failed (${img.error}).`);
  const bytes = Uint8Array.from(Buffer.from(img.b64, "base64"));
  await sendPhoto(chat, bytes, `${d.name} (${d.ticker})`);

  await sendText(chat, "Step 4 of 5: saving to IPFS, building both transactions and dry-running the first.");
  let prep: Prepared;
  try {
    prep = await prepareSponsored({ name: d.name, ticker: d.ticker, description: d.description, image: bytes, links: t.token.links, feeWallet, devBuySol: devBuy });
  } catch (e) {
    return sendText(chat, `Stopped while preparing: ${e instanceof Error ? e.message : "unknown error"}`);
  }
  const id = Math.random().toString(36).slice(2, 10);
  await putKey(`pending:${id}`, prep);
  const treasury = getEnv().TREASURY_PUBKEY ?? "";
  await sendText(chat, [
    "Step 5 of 5: ready for your approval. Nothing has been sent yet.",
    `Token: ${prep.plan.name} (${prep.plan.symbol})`,
    `Network: ${prep.plan.network}`,
    `Mint: ${prep.plan.mint}`,
    `Fees: 70% to ${short(feeWallet)} (${feeWallet}), 30% to the platform treasury ${short(treasury)}. This is permanent once launched.`,
    `Dev buy: ${prep.plan.devBuySol} SOL`,
    `Paid by: platform treasury (free for the launcher)`,
    prep.simNote,
    prep.simOk ? "" : "The dry run failed, so I recommend cancelling.",
    "The approval lasts 10 minutes.",
  ].filter(Boolean).join("\n"), [[{ text: "✅ Approve & launch", callback_data: `ok:${id}` }, { text: "❌ Cancel", callback_data: `no:${id}` }]]);
  if (await voiceOn()) void sendVoice(chat, `${prep.plan.name} is ready. You get seventy percent of the creator fees, the platform gets thirty. Tap approve to launch.`);
}

async function approve(chat: number, id: string) {
  const prep = await getKey<Prepared>(`pending:${id}`);
  if (!prep) return sendText(chat, "That approval expired or was already used. Send /launch again.");
  await delKey(`pending:${id}`); // single use
  if (!isExecuteEnabled()) return sendText(chat, "Launching is switched off on the server (EXECUTE_ENABLED is not true). Nothing was sent.");
  await sendText(chat, "Launching now. This takes about a minute.");
  try {
    const r = await executeSponsoredLaunch(prep.plan, prep.ticket, openBytes(prep.sealedMint, getEnv().SESSION_SECRET));
    if (r.ok) {
      await sendText(chat, [
        `Launched ${prep.plan.name} (${prep.plan.symbol}).`,
        `Token: ${tokLink(prep.plan.mint)}`,
        r.tx1 ? `Create tx: ${txLink(r.tx1)}` : "",
        r.tx2 ? `Fee split tx: ${txLink(r.tx2)}` : "Fee split was already set.",
        r.devBuy ? `Dev buy tx: ${txLink(r.devBuy)}` : "",
        r.error ? `Warning: ${r.error}` : "",
        r.split ? `Split check: ${r.split.ok ? "matches on-chain" : "MISMATCH, see /verify"}` : "",
      ].filter(Boolean).join("\n"));
      if (await voiceOn()) void sendVoice(chat, `${prep.plan.name} is live.`);
    } else {
      await sendText(chat, `Launch stopped at ${r.stage}: ${r.error ?? "unknown"}.${r.tx1 ? `\nCreate tx (already sent): ${txLink(r.tx1)}\nI can finish the split: send /resume ${prep.plan.mint}` : ""}`);
      if (r.tx1) await putKey(`resume:${prep.plan.mint}`, prep, 3600);
    }
  } catch (e) {
    await sendText(chat, `Launch blocked: ${e instanceof Error ? e.message : "unknown error"}`);
  }
}

async function cmdResume(chat: number, text: string) {
  const mint = firstArgs(text).addrs[0];
  const prep = mint ? await getKey<Prepared>(`resume:${mint}`) : null;
  if (!prep) return sendText(chat, "Nothing to resume for that mint (or it was more than an hour ago).");
  try {
    const r = await resumeSplit(prep.plan, prep.ticket);
    await sendText(chat, r.ok ? `The 70/30 split is now set and verified.${r.tx2 ? `\n${txLink(r.tx2)}` : ""}` : `Still failing: ${r.error ?? "unknown"}`);
  } catch (e) { await sendText(chat, `Blocked: ${e instanceof Error ? e.message : "unknown"}`); }
}

async function cmdLaunches(chat: number) {
  const l = await buildLedger(10);
  if (!l.ok) return sendText(chat, l.error);
  if (!l.rows.length) return sendText(chat, "No launches yet.");
  await sendText(chat, l.rows.map((r) => `${r.name} (${r.symbol}) · ${r.status} · ${r.network}${r.splitVerified === true ? " · split verified" : ""}\n${r.mint}`).join("\n\n"));
}

async function cmdFees(chat: number) {
  const l = await buildLedger(50);
  if (!l.ok) return sendText(chat, l.error);
  const lines = [`Launches: ${l.totals.launches} (${l.totals.live} live)`, `Waiting: ${sol(l.totals.pendingLamports)}`, `Sent: ${sol(l.totals.sentLamports)}`, "", ...l.wallets.map((w) => `${short(w.wallet)} · ${w.tokens} token(s) · waiting ${sol(w.pendingLamports)} · sent ${sol(w.sentLamports)}`)];
  await sendText(chat, lines.join("\n"), l.totals.pendingLamports > 20_000 ? [[{ text: "Send fees now", callback_data: "dist" }]] : undefined);
}

async function distribute(chat: number) {
  await sendText(chat, "Sending waiting fees. Each payout is split exactly as set on-chain.");
  const rs = await distributeAll();
  const lines = rs.map((r) => r.ok ? (r.paid?.length ? `${r.mint.slice(0, 6)}… paid ${r.paid.map((p) => `${short(p.wallet)} ${sol(p.lamports)}`).join(", ")}${r.sig ? `\n${txLink(r.sig)}` : ""}` : `${r.mint.slice(0, 6)}… ${r.skipped ?? "nothing to send"}`) : `${r.mint.slice(0, 6)}… error: ${r.error}`);
  await sendText(chat, lines.join("\n") || "No launches yet.");
}

async function cmdWallet(chat: number, text: string) {
  const w = firstArgs(text).addrs[0];
  if (!w) { const cur = await savedWallet(); return sendText(chat, cur ? `Your fee wallet is ${cur}. Send /wallet <address> to change it.` : "Send /wallet <address> to save the wallet that gets the 70% fees."); }
  const t = await tool("trust_check", { wallet: w });
  if (!t.ok) return sendText(chat, t.message);
  if (!t.result.normalWallet) return sendText(chat, `Not saved. This does not look like a normal wallet:\n${t.result.notes.join("\n")}`);
  await putKey("wallet", w, 60 * 60 * 24 * 365);
  await sendText(chat, `Saved. Fees go to ${w}.${t.result.notes.length ? "\nNote: " + t.result.notes.join(" ") : ""}`);
}

async function chatReply(chat: number, text: string) {
  const h = history.get(chat) ?? [];
  h.push({ role: "user", content: text.slice(0, 500) });
  const sys = `${PERSONA}\n\nYou are talking to your admin on Telegram. Answer in at most three short sentences, plain words. When asked how you are built or what you can do, use this knowledge:\n${AGENT_KNOWLEDGE}\nYou can run these commands for them: /status /scan /draft /launch /fees /distribute /verify /lookalikes /how. Never claim you launched or moved anything unless a command result says so.`;
  const out = await riverChat([{ role: "system", content: sys }, ...h.slice(-8)], { key: "agent", maxTokens: 220 });
  const reply = out.ok ? out.text.trim() : "My brain did not answer. Try again in a moment.";
  h.push({ role: "assistant", content: reply });
  history.set(chat, h.slice(-12));
  await sendText(chat, reply);
  if (out.ok && (await voiceOn())) await sendVoice(chat, reply);
}

async function handleText(chat: number, text: string) {
  const cmd = (text.split(/\s+/)[0] ?? "").toLowerCase().replace(/@\w+$/, "");
  switch (cmd) {
    case "/start": case "/help": return sendText(chat, HELP);
    case "/status": return cmdStatus(chat);
    case "/health": return cmdHealth(chat);
    case "/balance": return cmdBalance(chat, text);
    case "/scan": { const m = firstArgs(text).addrs[0]; return m ? cmdScan(chat, m, false) : sendText(chat, "Usage: /scan <token mint>"); }
    case "/draft": { const m = firstArgs(text).addrs[0]; return m ? cmdScan(chat, m, true) : sendText(chat, "Usage: /draft <token mint>"); }
    case "/wallet": return cmdWallet(chat, text);
    case "/launch": return cmdLaunch(chat, text);
    case "/resume": return cmdResume(chat, text);
    case "/launches": return cmdLaunches(chat);
    case "/fees": return cmdFees(chat);
    case "/distribute": return cmdFees(chat);
    case "/verify": {
      const m = firstArgs(text).addrs[0];
      if (!m) return sendText(chat, "Usage: /verify <mint>");
      const r = await tool("verify_launch", { mint: m });
      return sendText(chat, r.ok ? `${r.result.ok ? "All checks passed." : "Some checks failed."}\n${(r.result.checks ?? []).map((c: { ok: boolean; name: string; detail: string }) => `${c.ok ? "✅" : "❌"} ${c.name}: ${c.detail}`).join("\n")}` : r.message);
    }
    case "/lookalikes": {
      const { words } = firstArgs(text);
      const ticker = words.length > 1 ? words[words.length - 1] : "";
      const name = words.length > 1 ? words.slice(0, -1).join(" ") : words.join(" ");
      const r = await tool("scan_lookalikes", { name, ticker });
      return sendText(chat, r.ok ? JSON.stringify(r.result, null, 1).slice(0, 3500) : r.message);
    }
    case "/voice": { const on = /\bon\b/i.test(text); await putKey("voice", on, 60 * 60 * 24 * 365); return sendText(chat, on ? "Voice notes are on." : "Voice notes are off. Send /voice on to turn them on."); }
    case "/tools": return sendText(chat, TOOLS.map((t) => `${t.name}: ${t.title}`).join("\n"));
    case "/how": return chatReply(chat, "Explain in a few sentences how you are built and how a launch works from scan to fee split.");
    default: {
      if (cmd.startsWith("/")) return sendText(chat, "I don't know that command. Send /help.");
      const addr = text.split(/\s+/).find(isSolanaAddress);
      if (addr && text.trim().split(/\s+/).length <= 2) return cmdScan(chat, addr, true);
      if (/\blaunch\b/i.test(text) && addr) return sendText(chat, `To launch it, send:\n/launch ${addr} <fee wallet>`);
      return chatReply(chat, text);
    }
  }
}

export async function handleUpdate(u: Update): Promise<void> {
  if (seen.includes(u.update_id)) return;
  seen.push(u.update_id);
  if (seen.length > 300) seen.shift();
  const admin = adminId();
  const from = u.message?.from?.id ?? u.callback_query?.from.id;
  const chat = u.message?.chat ?? u.callback_query?.message?.chat;
  if (!chat || from == null) return;
  if (admin == null || from !== admin || chat.type !== "private") {
    if (u.message) await sendText(chat.id, "This bot is private.");
    return;
  }
  try {
    if (u.callback_query) {
      const cb = u.callback_query;
      await tg("answerCallbackQuery", { callback_query_id: cb.id });
      const [kind, id] = (cb.data ?? "").split(":");
      if (cb.message) await tg("editMessageReplyMarkup", { chat_id: chat.id, message_id: cb.message.message_id, reply_markup: { inline_keyboard: [] } });
      if (kind === "ok" && id) return await approve(chat.id, id);
      if (kind === "no" && id) { await delKey(`pending:${id}`); return await void sendText(chat.id, "Cancelled. Nothing was sent."); }
      if (kind === "dist") return await distribute(chat.id);
      return;
    }
    const text = u.message?.text?.trim();
    if (text) await handleText(chat.id, text);
  } catch (e) {
    console.error("telegram handler failed:", e instanceof Error ? e.message : "unknown");
    await sendText(chat.id, "Something went wrong on my side. Nothing was sent. Try again.");
  }
}
