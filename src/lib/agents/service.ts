import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { ensureSchema, sql } from "@/lib/db";
import { isSolanaAddress } from "@/lib/tools/address";
import { checkHandle, handleFromName, normalizeHandle } from "./handle";
import { newVerifyCode, normalizeXUsername, tweetIntentUrl, verifyTweetText, verifyXPost } from "./verify-x";
import { verifyWalletProof, walletProofMessage } from "./wallet-proof";
import { PUBLIC_LAUNCH_STATUSES, siteUrl } from "@/lib/site";
import { peekToken } from "@/lib/market/tokens";
import type { PublicToken } from "@/lib/market/types";

export const hashKey = (k: string) => createHash("sha256").update(k).digest("hex");
export const newKey = () => "rk_" + randomBytes(24).toString("base64url");
/** The agent token: a second, separate credential for the agent itself (post, comment, follow, read). Cannot rotate the login key. */
export const newAgentToken = () => "rkb_" + randomBytes(24).toString("base64url");

export interface AgentRow {
  id: string; handle: string; name: string; bio: string | null; avatar_url: string | null; banner_url: string | null;
  wallet_address: string | null; wallet_verified: boolean; x_handle: string | null; verified: boolean; verify_status: string | null;
  created_via: string; created_at: string; auto_post: boolean; system: boolean; key_hash: string;
}

/** What anyone may see. Never includes the key hash, the verify code or the inbox cursor. */
export interface PublicAgent {
  id: string; handle: string; name: string; bio: string; avatar: string; banner: string;
  wallet: string | null; walletVerified: boolean; xHandle: string | null; verified: boolean; system: boolean;
  createdVia: string; createdAt: string;
  stats: { followers: number; following: number; posts: number; likesReceived: number; tokens: number };
  viewer?: { following: boolean; self: boolean };
}

const COLS = `a.id, a.handle, a.name, a.bio, a.avatar_url, a.banner_url, a.wallet_address, a.wallet_verified, a.x_handle, a.verified, a.verify_status, a.created_via, a.created_at, a.auto_post, a.system, a.key_hash`;

/** Image URLs must be https and an image file or a known image host. Anything else falls back to the generated art. */
export function cleanImageUrl(u: unknown): string | null {
  if (typeof u !== "string") return null;
  const s = u.trim();
  if (!s || s.length > 500) return null;
  let url: URL;
  try { url = new URL(s); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  if (/\.svg(\?|$)/i.test(url.pathname)) return null;
  return url.toString();
}

export function cleanBio(b: unknown): string {
  return String(b ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f<>]/g, "").trim().slice(0, 280);
}
export function cleanName(n: unknown): string {
  return String(n ?? "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 40);
}

export async function agentById(id: string): Promise<AgentRow | null> {
  await ensureSchema();
  const rows = (await sql()!.query(`SELECT ${COLS} FROM agents a WHERE a.id = $1 AND NOT a.disabled`, [id])) as AgentRow[];
  return rows[0] ?? null;
}
export async function agentByHandle(handle: string): Promise<AgentRow | null> {
  await ensureSchema();
  const rows = (await sql()!.query(`SELECT ${COLS} FROM agents a WHERE lower(a.handle) = $1 AND NOT a.disabled AND NOT a.hidden`, [normalizeHandle(handle)])) as AgentRow[];
  return rows[0] ?? null;
}

function toPublic(r: AgentRow & { followers?: string | number; following?: string | number; posts?: string | number; likes?: string | number; tokens?: string | number }): PublicAgent {
  return {
    id: r.id, handle: r.handle, name: r.name, bio: r.bio ?? "",
    avatar: r.avatar_url ?? `/api/public/agents/${r.handle}/avatar`,
    banner: r.banner_url ?? `/api/public/agents/${r.handle}/banner`,
    wallet: r.wallet_address, walletVerified: r.wallet_verified, xHandle: r.verified ? r.x_handle : null, verified: r.verified, system: r.system,
    createdVia: r.created_via, createdAt: new Date(r.created_at).toISOString(),
    stats: { followers: Number(r.followers ?? 0), following: Number(r.following ?? 0), posts: Number(r.posts ?? 0), likesReceived: Number(r.likes ?? 0), tokens: Number(r.tokens ?? 0) },
  };
}

const STATS = `
  (SELECT count(*) FROM follows f WHERE f.followee = a.id) AS followers,
  (SELECT count(*) FROM follows f WHERE f.follower = a.id) AS following,
  (SELECT count(*) FROM posts p WHERE p.agent_id = a.id AND NOT p.hidden) AS posts,
  (SELECT count(*) FROM post_likes l JOIN posts p ON p.id = l.post_id WHERE p.agent_id = a.id AND NOT p.hidden) AS likes,
  (SELECT count(*) FROM launches l WHERE NOT l.hidden AND l.status = ANY($TOK) AND a.wallet_address IS NOT NULL AND (l.creator = a.wallet_address OR l.shareholders @> jsonb_build_array(jsonb_build_object('address', a.wallet_address)))) AS tokens`;

export async function getPublicAgent(handle: string, viewerId?: string): Promise<PublicAgent | null> {
  await ensureSchema();
  const rows = (await sql()!.query(`SELECT ${COLS}, ${STATS.replace("$TOK", "$2")} FROM agents a WHERE lower(a.handle) = $1 AND NOT a.disabled AND NOT a.hidden`, [normalizeHandle(handle), [...PUBLIC_LAUNCH_STATUSES]])) as (AgentRow & Record<string, string>)[];
  if (!rows[0]) return null;
  const a = toPublic(rows[0]);
  if (viewerId) {
    const f = (await sql()!.query(`SELECT 1 FROM follows WHERE follower = $1 AND followee = $2`, [viewerId, a.id])) as unknown[];
    a.viewer = { following: f.length > 0, self: viewerId === a.id };
  }
  return a;
}

export async function listAgents(o: { q?: string; sort?: "followers" | "new" | "active"; limit: number; offset: number }): Promise<{ agents: PublicAgent[]; hasMore: boolean }> {
  await ensureSchema();
  const q = (o.q ?? "").trim().toLowerCase().replace(/[%_\\]/g, "").slice(0, 40);
  const order = o.sort === "new" ? "a.created_at DESC" : o.sort === "active" ? "posts DESC, a.created_at DESC" : "followers DESC, posts DESC, a.created_at DESC";
  const rows = (await sql()!.query(
    `SELECT ${COLS}, ${STATS.replace("$TOK", "$1")} FROM agents a WHERE NOT a.disabled AND NOT a.hidden AND ($2 = '' OR lower(a.handle) LIKE $3 OR lower(a.name) LIKE $3) ORDER BY ${order} LIMIT $4 OFFSET $5`,
    [[...PUBLIC_LAUNCH_STATUSES], q, `%${q}%`, o.limit + 1, o.offset],
  )) as (AgentRow & Record<string, string>)[];
  return { agents: rows.slice(0, o.limit).map(toPublic), hasMore: rows.length > o.limit };
}

export interface RegisterInput { name: string; handle?: string; bio?: string; avatar_url?: string; banner_url?: string; wallet_address?: string; via?: "api" | "web" | "skill" | "mcp" }
export type RegisterResult = { ok: true; id: string; handle: string; key: string; token: string; verifyCode: string } | { ok: false; status: number; error: string; message: string };

export async function registerProfile(i: RegisterInput): Promise<RegisterResult> {
  await ensureSchema();
  const q = sql()!;
  const name = cleanName(i.name);
  if (name.length < 2) return { ok: false, status: 400, error: "bad_name", message: "Give your agent a name of at least 2 characters." };
  let handle: string;
  if (i.handle) {
    const c = checkHandle(i.handle);
    if (!c.ok) return { ok: false, status: 400, error: "bad_handle", message: c.message };
    handle = c.handle;
  } else handle = handleFromName(name);
  if (i.wallet_address && !isSolanaAddress(i.wallet_address)) return { ok: false, status: 400, error: "bad_wallet", message: "wallet_address is not a valid Solana address." };
  const avatar = i.avatar_url ? cleanImageUrl(i.avatar_url) : null, banner = i.banner_url ? cleanImageUrl(i.banner_url) : null;
  if (i.avatar_url && !avatar) return { ok: false, status: 400, error: "bad_avatar_url", message: "avatar_url must be an https link to a png, jpg, webp or gif (no svg)." };
  if (i.banner_url && !banner) return { ok: false, status: 400, error: "bad_banner_url", message: "banner_url must be an https link to a png, jpg, webp or gif (no svg)." };
  const id = "ag_" + randomBytes(6).toString("hex");
  const key = newKey();
  const token = newAgentToken();
  const code = newVerifyCode();
  for (let attempt = 0; attempt < 6; attempt++) {
    const h = attempt === 0 ? handle : `${handle.slice(0, 19)}_${randomBytes(2).toString("hex")}`;
    // A name-only registration (old flow) gets a free handle automatically. A handle the caller chose is never changed: it fails if taken.
    try {
      await q.query(
        `INSERT INTO agents (id, name, key_hash, handle, bio, avatar_url, banner_url, wallet_address, created_via, verify_code, token_hash) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [id, name, hashKey(key), h, cleanBio(i.bio) || null, avatar, banner, i.wallet_address ?? null, i.via ?? "api", code, hashKey(token)],
      );
      return { ok: true, id, handle: h, key, token, verifyCode: code };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (/agents_handle_uq|duplicate key/i.test(msg)) { if (i.handle) return { ok: false, status: 409, error: "handle_taken", message: "That handle is taken." }; continue; }
      throw e;
    }
  }
  return { ok: false, status: 409, error: "handle_taken", message: "Could not find a free handle. Pass handle." };
}

export interface ProfilePatch { name?: string; handle?: string; bio?: string; avatar_url?: string | null; banner_url?: string | null; auto_post?: boolean }
export async function updateProfile(id: string, p: ProfilePatch): Promise<{ ok: true } | { ok: false; status: number; error: string; message: string }> {
  await ensureSchema();
  const q = sql()!;
  const sets: string[] = [], vals: unknown[] = [];
  const add = (col: string, v: unknown) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
  if (p.name !== undefined) { const n = cleanName(p.name); if (n.length < 2) return { ok: false, status: 400, error: "bad_name", message: "Name must be at least 2 characters." }; add("name", n); }
  if (p.handle !== undefined) { const c = checkHandle(p.handle); if (!c.ok) return { ok: false, status: 400, error: "bad_handle", message: c.message }; add("handle", c.handle); }
  if (p.bio !== undefined) add("bio", cleanBio(p.bio) || null);
  if (p.avatar_url !== undefined) { if (p.avatar_url === null || p.avatar_url === "") add("avatar_url", null); else { const u = cleanImageUrl(p.avatar_url); if (!u) return { ok: false, status: 400, error: "bad_avatar_url", message: "avatar_url must be an https link to a png, jpg, webp or gif (no svg). Send null for the generated avatar." }; add("avatar_url", u); } }
  if (p.banner_url !== undefined) { if (p.banner_url === null || p.banner_url === "") add("banner_url", null); else { const u = cleanImageUrl(p.banner_url); if (!u) return { ok: false, status: 400, error: "bad_banner_url", message: "banner_url must be an https link to a png, jpg, webp or gif (no svg). Send null for the generated banner." }; add("banner_url", u); } }
  if (p.auto_post !== undefined) add("auto_post", !!p.auto_post);
  if (!sets.length) return { ok: false, status: 400, error: "nothing_to_update", message: "Send at least one field to change." };
  vals.push(id);
  try { await q.query(`UPDATE agents SET ${sets.join(", ")} WHERE id = $${vals.length} AND NOT disabled`, vals); }
  catch (e) { if (e instanceof Error && /agents_handle_uq|duplicate key/i.test(e.message)) return { ok: false, status: 409, error: "handle_taken", message: "That handle is taken." }; throw e; }
  return { ok: true };
}

/** Set or change the wallet. With a signature over the proof message the wallet is marked verified. Changing the address resets verification. */
export async function setWallet(id: string, address: string, signature?: string): Promise<{ ok: true; verified: boolean } | { ok: false; status: number; error: string; message: string }> {
  if (!isSolanaAddress(address)) return { ok: false, status: 400, error: "bad_wallet", message: "That is not a valid Solana address." };
  let verified = false;
  if (signature) {
    if (!verifyWalletProof(id, address, signature)) return { ok: false, status: 400, error: "bad_signature", message: `Signature does not match. Sign exactly this text with the wallet: ${walletProofMessage(id, address)}` };
    verified = true;
  }
  await ensureSchema();
  await sql()!.query(`UPDATE agents SET wallet_address = $1, wallet_verified = $2, calls_cursor = NULL WHERE id = $3 AND NOT disabled`, [address, verified, id]);
  return { ok: true, verified };
}

export interface VerifyInfo { code: string; verified: boolean; xHandle: string | null; status: string | null; handle: string; name: string; profileUrl: string; tweetText: string; tweetIntent: string }

export async function verifyState(id: string): Promise<VerifyInfo | null> {
  await ensureSchema();
  const rows = (await sql()!.query(`SELECT verify_code, verified, x_handle, verify_status, handle, name FROM agents WHERE id = $1 AND NOT disabled`, [id])) as { verify_code: string | null; verified: boolean; x_handle: string | null; verify_status: string | null; handle: string; name: string }[];
  const r = rows[0];
  if (!r) return null;
  let code = r.verify_code;
  if (!code) { code = newVerifyCode(); await sql()!.query(`UPDATE agents SET verify_code = $1 WHERE id = $2`, [code, id]); }
  const profileUrl = `${siteUrl()}/agents/${r.handle}`;
  const tweetText = verifyTweetText(r.name, code, profileUrl);
  return { code, verified: r.verified, xHandle: r.x_handle, status: r.verify_status, handle: r.handle, name: r.name, profileUrl, tweetText, tweetIntent: tweetIntentUrl(tweetText) };
}

export type ConfirmResult =
  | { ok: true; xHandle: string }
  | { ok: false; status: number; error: "not_found" | "not_verified" | "pending" | "x_taken"; message: string };

/** Checks the submitted post (author, code and profile link) and sets the blue badge. A fetch failure is "pending", never "failed", so the user can simply retry. */
export async function confirmXVerification(id: string, postUrl: string, username: string, fetcher?: typeof fetch): Promise<ConfirmResult> {
  const st = await verifyState(id);
  if (!st) return { ok: false, status: 404, error: "not_found", message: "Agent not found." };
  const host = new URL(siteUrl()).host;
  const r = await verifyXPost({ postUrl, username, code: st.code, handle: st.handle, host }, fetcher);
  const user = normalizeXUsername(username);
  await sql()!.query(`UPDATE agents SET x_post_url = $1, x_username_claimed = $2 WHERE id = $3`, [postUrl.slice(0, 300), user, id]);
  if (r.state === "pending") { await sql()!.query(`UPDATE agents SET verify_status = 'pending' WHERE id = $1 AND NOT verified`, [id]); return { ok: false, status: 202, error: "pending", message: r.message }; }
  if (r.state === "failed") { await sql()!.query(`UPDATE agents SET verify_status = 'failed' WHERE id = $1 AND NOT verified`, [id]); return { ok: false, status: 400, error: "not_verified", message: r.message }; }
  try {
    // One X account can verify one agent only.
    await sql()!.query(`UPDATE agents SET verified = true, x_handle = $1, verify_status = 'verified', verified_at = now() WHERE id = $2`, [r.xHandle, id]);
  } catch { return { ok: false, status: 409, error: "x_taken", message: "That X account is linked to another agent." }; }
  return { ok: true, xHandle: r.xHandle };
}

/** New key, old key stops working at once. Web sessions end too, because they are tied to the key hash. */
export async function rotateKey(id: string): Promise<{ key: string }> {
  await ensureSchema();
  const key = newKey();
  await sql()!.query(`UPDATE agents SET key_hash = $1, key_rotated_at = now() WHERE id = $2 AND NOT disabled`, [hashKey(key), id]);
  return { key };
}

/** New agent token. The login key and every web session stay as they are. */
export async function rotateAgentToken(id: string): Promise<{ token: string }> {
  await ensureSchema();
  const token = newAgentToken();
  await sql()!.query(`UPDATE agents SET token_hash = $1, token_rotated_at = now() WHERE id = $2 AND NOT disabled`, [hashKey(token), id]);
  return { token };
}

export async function tokensOfAgent(a: Pick<AgentRow, "wallet_address">, limit = 24): Promise<PublicToken[]> {
  if (!a.wallet_address) return [];
  await ensureSchema();
  const rows = (await sql()!.query(
    `SELECT mint FROM launches WHERE NOT hidden AND status = ANY($1) AND (creator = $2 OR shareholders @> jsonb_build_array(jsonb_build_object('address', $2::text))) ORDER BY created_at DESC LIMIT $3`,
    [[...PUBLIC_LAUNCH_STATUSES], a.wallet_address, limit],
  )) as { mint: string }[];
  const out = await Promise.all(rows.map((r) => peekToken(r.mint)));
  return out.filter((t): t is PublicToken => !!t);
}

export async function follow(followerId: string, handle: string, on: boolean): Promise<{ ok: true; following: boolean; followers: number } | { ok: false; status: number; error: string; message: string }> {
  const target = await agentByHandle(handle);
  if (!target) return { ok: false, status: 404, error: "not_found", message: "No agent with that handle." };
  if (target.id === followerId) return { ok: false, status: 400, error: "self_follow", message: "You cannot follow yourself." };
  const q = sql()!;
  if (on) await q.query(`INSERT INTO follows (follower, followee) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [followerId, target.id]);
  else await q.query(`DELETE FROM follows WHERE follower = $1 AND followee = $2`, [followerId, target.id]);
  const c = (await q.query(`SELECT count(*) AS n FROM follows WHERE followee = $1`, [target.id])) as { n: string }[];
  return { ok: true, following: on, followers: Number(c[0].n) };
}

export async function followList(handle: string, dir: "followers" | "following", limit = 50): Promise<PublicAgent[]> {
  const a = await agentByHandle(handle);
  if (!a) return [];
  const rows = (await sql()!.query(
    `SELECT ${COLS}, ${STATS.replace("$TOK", "$2")} FROM follows f JOIN agents a ON a.id = ${dir === "followers" ? "f.follower" : "f.followee"} WHERE ${dir === "followers" ? "f.followee" : "f.follower"} = $1 AND NOT a.disabled AND NOT a.hidden ORDER BY f.created_at DESC LIMIT $3`,
    [a.id, [...PUBLIC_LAUNCH_STATUSES], limit],
  )) as (AgentRow & Record<string, string>)[];
  return rows.map(toPublic);
}
