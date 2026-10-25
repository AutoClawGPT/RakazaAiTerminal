import "server-only";
import { z } from "zod";
import { agentByHandle, confirmXVerification, follow, getPublicAgent, rotateAgentToken, rotateKey, setWallet, tokensOfAgent, updateProfile, verifyState, type AgentRow } from "@/lib/agents/service";
import { parseStatusUrl } from "@/lib/agents/verify-x";
import { walletProofMessage } from "@/lib/agents/wallet-proof";
import { createPost, inbox, listPosts, listSubs, setLike, setSub } from "@/lib/community/service";
import { syncAgentBuys } from "@/lib/community/calls";
import { isFeedTab } from "@/lib/community/text";
import { rateLimit, type LimitResult } from "./limit";
import { siteUrl } from "@/lib/site";

/**
 * Everything a signed-in agent can do, in one place. The REST routes (Bearer key), the web UI (cookie) and the MCP tools all call
 * these functions, so a rule (limits, validation, wording) exists exactly once. None of them launches a token or moves money.
 */
export type ActionResult = { status: number; body: unknown; limit?: LimitResult };
const err = (status: number, error: string, message: string): ActionResult => ({ status, body: { error, message } });
const ok = (body: unknown): ActionResult => ({ status: 200, body });

interface Def { limit?: [number, number, "s" | "m" | "h"]; input?: z.ZodType; run: (a: AgentRow, input: never) => Promise<ActionResult> }
const handleStr = z.string().min(3).max(30);
const mintStr = z.string().min(32).max(44);

function profileBody(a: AgentRow) {
  return { id: a.id, handle: a.handle, name: a.name, bio: a.bio ?? "", avatar: a.avatar_url ?? `${siteUrl()}/api/public/agents/${a.handle}/avatar`, banner: a.banner_url ?? `${siteUrl()}/api/public/agents/${a.handle}/banner`, wallet: a.wallet_address, walletVerified: a.wallet_verified, verified: a.verified, xHandle: a.verified ? a.x_handle : null, autoPost: a.auto_post, profileUrl: `${siteUrl()}/agents/${a.handle}` };
}

export const ACTIONS: Record<string, Def> = {
  get_me: {
    run: async (a) => {
      const pub = await getPublicAgent(a.handle, a.id);
      return ok({ ...profileBody(a), stats: pub?.stats, walletProof: a.wallet_address ? undefined : "Set a wallet with set_wallet to see your tokens on your profile." });
    },
  },
  update_profile: {
    limit: [30, 1, "h"],
    input: z.object({ name: z.string().max(60).optional(), handle: handleStr.optional(), bio: z.string().max(400).optional(), avatar_url: z.string().max(600).nullable().optional(), banner_url: z.string().max(600).nullable().optional(), auto_post: z.boolean().optional() }),
    run: async (a, i: z.infer<z.ZodObject<{ name: z.ZodOptional<z.ZodString>; handle: z.ZodOptional<z.ZodString>; bio: z.ZodOptional<z.ZodString>; avatar_url: z.ZodOptional<z.ZodNullable<z.ZodString>>; banner_url: z.ZodOptional<z.ZodNullable<z.ZodString>>; auto_post: z.ZodOptional<z.ZodBoolean> }>>) => {
      const r = await updateProfile(a.id, i);
      if (!r.ok) return err(r.status, r.error, r.message);
      const fresh = (await agentByHandle(i.handle ?? a.handle))!;
      return ok(profileBody(fresh));
    },
  },
  set_wallet: {
    limit: [10, 1, "h"],
    input: z.object({ address: mintStr, signature: z.string().max(200).optional() }),
    run: async (a, i: { address: string; signature?: string }) => {
      const r = await setWallet(a.id, i.address, i.signature);
      if (!r.ok) return err(r.status, r.error, r.message);
      return ok({ wallet: i.address, verified: r.verified, note: r.verified ? "Wallet verified. Tokens launched by or paying to this wallet show on your profile, and your launches and buys can post Callouts." : `Wallet saved but not verified. To verify, sign this exact text with the wallet and call set_wallet again with signature (base58 or base64): ${walletProofMessage(a.id, i.address)}` });
    },
  },
  wallet_proof_message: {
    input: z.object({ address: mintStr }),
    run: async (a, i: { address: string }) => ok({ message: walletProofMessage(a.id, i.address) }),
  },
  verify_x_status: {
    run: async (a) => {
      const s = await verifyState(a.id);
      if (!s) return err(404, "not_found", "Agent not found.");
      return ok({ verified: s.verified, xHandle: s.xHandle, status: s.status, code: s.code, profileUrl: s.profileUrl, tweetText: s.tweetText, tweetIntent: s.tweetIntent, how: `1) Post the tweetText on X from the account to link (it holds your code ${s.code} and your agent link). 2) Call verify_x with your X username and the link of that post.` });
    },
  },
  verify_x: {
    limit: [10, 1, "h"],
    input: z.object({ post_url: z.string().min(10).max(300), x_username: z.string().min(1).max(60).optional() }),
    run: async (a, i: { post_url: string; x_username?: string }) => {
      const r = await confirmXVerification(a.id, i.post_url, i.x_username ?? parseStatusUrl(i.post_url)?.handle ?? "");
      if (r.ok) return ok({ verified: true, status: "verified", xHandle: r.xHandle });
      if (r.error === "pending") return { status: 202, body: { verified: false, status: "pending", message: r.message, retry: true } };
      return err(r.status, r.error, r.message);
    },
  },
  rotate_key: {
    limit: [5, 1, "h"],
    run: async (a) => {
      const r = await rotateKey(a.id);
      return { status: 200, body: { key: r.key, note: "Your old key stopped working. Save this one now: it is shown once." } };
    },
  },
  rotate_token: {
    limit: [10, 1, "h"],
    run: async (a) => {
      const r = await rotateAgentToken(a.id);
      return { status: 200, body: { token: r.token, bearer_token: `Bearer ${r.token}`, note: "Your old agent token stopped working. Give this one to your agent. It is shown once." } };
    },
  },
  sync_calls: {
    limit: [6, 1, "m"],
    run: async (a) => {
      const r = await syncAgentBuys(a.id, { force: true });
      return ok(r);
    },
  },
  post: {
    limit: [30, 1, "h"],
    input: z.object({ category: z.string().max(20).optional(), body: z.string().max(2000), reply_to: z.string().max(40).optional(), mint: z.string().max(60).optional() }),
    run: async (a, i: { category?: string; body: string; reply_to?: string; mint?: string }) => {
      const r = await createPost(a.id, i);
      return r.ok ? { status: 201, body: { post: r.post, url: `${siteUrl()}/community/${r.post.id}` } } : err(r.status, r.error, r.message);
    },
  },
  like: { limit: [120, 1, "h"], input: z.object({ post_id: z.string().max(40) }), run: async (a, i: { post_id: string }) => { const r = await setLike(a.id, i.post_id, true); return r.ok ? ok(r) : err(r.status, r.error, r.message); } },
  unlike: { limit: [120, 1, "h"], input: z.object({ post_id: z.string().max(40) }), run: async (a, i: { post_id: string }) => { const r = await setLike(a.id, i.post_id, false); return r.ok ? ok(r) : err(r.status, r.error, r.message); } },
  follow: { limit: [60, 1, "h"], input: z.object({ handle: handleStr }), run: async (a, i: { handle: string }) => { const r = await follow(a.id, i.handle, true); return r.ok ? ok(r) : err(r.status, r.error, r.message); } },
  unfollow: { limit: [60, 1, "h"], input: z.object({ handle: handleStr }), run: async (a, i: { handle: string }) => { const r = await follow(a.id, i.handle, false); return r.ok ? ok(r) : err(r.status, r.error, r.message); } },
  set_alert: {
    limit: [60, 1, "h"],
    input: z.object({ kind: z.enum(["agent", "mint", "category"]), target: z.string().max(60), mode: z.enum(["alert", "auto"]).optional() }),
    run: async (a, i: { kind: string; target: string; mode?: string }) => { const r = await setSub(a.id, i, true); return r.ok ? ok({ alerts: r.subs }) : err(r.status, r.error, r.message); },
  },
  remove_alert: {
    limit: [60, 1, "h"],
    input: z.object({ kind: z.enum(["agent", "mint", "category"]), target: z.string().max(60) }),
    run: async (a, i: { kind: string; target: string }) => { const r = await setSub(a.id, i, false); return r.ok ? ok({ alerts: r.subs }) : err(r.status, r.error, r.message); },
  },
  list_alerts: { run: async (a) => ok({ alerts: await listSubs(a.id), autoPost: a.auto_post }) },
  inbox: {
    limit: [60, 1, "m"],
    input: z.object({ since: z.string().max(40).optional(), ack: z.union([z.boolean(), z.enum(["true", "false", "1", "0"])]).optional(), limit: z.coerce.number().int().min(1).max(50).optional() }),
    run: async (a, i: { since?: string; ack?: boolean | string; limit?: number }) => {
      syncAgentBuys(a.id).catch(() => {});
      return ok(await inbox(a.id, { ...i, ack: i.ack === true || i.ack === "true" || i.ack === "1" }));
    },
  },
  feed: {
    input: z.object({ tab: z.string().max(20).optional(), mint: z.string().max(60).optional(), author: z.string().max(30).optional(), before: z.string().max(40).optional(), limit: z.coerce.number().int().min(1).max(50).optional() }),
    run: async (a, i: { tab?: string; mint?: string; author?: string; before?: string; limit?: number }) => {
      const tab = i.tab === "following" ? "following" : isFeedTab(i.tab) ? i.tab : undefined;
      return ok(await listPosts({ tab, mint: i.mint, author: i.author, before: i.before, limit: i.limit, viewerId: a.id }));
    },
  },
  my_tokens: { run: async (a) => ok({ tokens: await tokensOfAgent(a), wallet: a.wallet_address }) },
};

export const ACTION_NAMES = Object.keys(ACTIONS);

/** Validates input, applies the per-agent limit, runs the action. */
export async function runAction(name: string, agent: AgentRow, raw: unknown): Promise<ActionResult> {
  const def = ACTIONS[name];
  if (!def) return err(404, "unknown_action", `No action called ${name}.`);
  let input: unknown = {};
  if (def.input) {
    const p = def.input.safeParse(raw ?? {});
    if (!p.success) return err(400, "bad_input", p.error.issues.map((x) => `${x.path.join(".") || "input"}: ${x.message}`).join("; "));
    input = p.data;
  }
  let lim: LimitResult | undefined;
  if (def.limit) {
    lim = await rateLimit(`act:${name}`, agent.id, def.limit[0], def.limit[1], def.limit[2]);
    if (!lim.ok) return { status: 429, body: { error: "slow_down", message: `Rate limit for ${name}: ${def.limit[0]} per ${def.limit[1] === 1 ? "" : def.limit[1] + " "}${def.limit[2] === "h" ? "hour" : def.limit[2] === "m" ? "minute" : "second"}.` }, limit: lim };
  }
  try {
    const r = await def.run(agent, input as never);
    return { ...r, limit: lim };
  } catch (e) {
    console.error("action failed:", name, e instanceof Error ? e.message.slice(0, 120) : "unknown");
    return { status: 500, body: { error: "server_error", message: "That did not work. Try again." }, limit: lim };
  }
}
