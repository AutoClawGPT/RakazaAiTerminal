import "server-only";
import { randomBytes } from "node:crypto";
import { ensureSchema, sql } from "@/lib/db";
import { isSolanaAddress } from "@/lib/tools/address";
import { hashKey, newKey } from "@/lib/agents/service";
import { cleanPostBody, isCategory, type PostCategory, type FeedTab } from "./text";
import { MAX_POST } from "./text";

export { MAX_POST };

export interface PostAuthor { handle: string; name: string; avatar: string; verified: boolean; system: boolean }
export interface PostView {
  id: string; category: PostCategory; kind: "post" | "call" | "launch"; body: string; createdAt: string;
  author: PostAuthor; replyTo: string | null;
  mint: string | null; token: { name: string; symbol: string; image: string | null } | null;
  call: Record<string, unknown> | null;
  likes: number; replies: number; viewerLiked?: boolean;
}

const POST_SELECT = `
  p.id, p.category, p.kind, p.body, p.created_at, p.reply_to, p.mint, p.call,
  a.handle AS a_handle, a.name AS a_name, a.avatar_url AS a_avatar, a.verified AS a_verified, a.system AS a_system,
  l.name AS t_name, l.symbol AS t_symbol, ms.image_url AS t_image,
  (SELECT count(*) FROM post_likes x WHERE x.post_id = p.id) AS likes,
  (SELECT count(*) FROM posts r WHERE r.reply_to = p.id AND NOT r.hidden) AS replies`;
const POST_FROM = `FROM posts p JOIN agents a ON a.id = p.agent_id LEFT JOIN launches l ON l.mint = p.mint LEFT JOIN mint_stats ms ON ms.mint = p.mint`;
const POST_WHERE_BASE = `NOT p.hidden AND NOT a.disabled AND NOT a.hidden`;

type Row = Record<string, unknown>;
function toPost(r: Row, liked?: Set<string>): PostView {
  const handle = String(r.a_handle);
  return {
    id: String(r.id), category: r.category as PostCategory, kind: r.kind as PostView["kind"], body: String(r.body), createdAt: new Date(String(r.created_at)).toISOString(),
    author: { handle, name: String(r.a_name), avatar: (r.a_avatar as string | null) ?? `/api/public/agents/${handle}/avatar`, verified: !!r.a_verified, system: !!r.a_system },
    replyTo: (r.reply_to as string | null) ?? null, mint: (r.mint as string | null) ?? null,
    token: r.t_symbol ? { name: String(r.t_name), symbol: String(r.t_symbol), image: (r.t_image as string | null) ?? null } : null,
    call: (r.call as Record<string, unknown> | null) ?? null,
    likes: Number(r.likes), replies: Number(r.replies),
    ...(liked ? { viewerLiked: liked.has(String(r.id)) } : {}),
  };
}

async function likedSet(viewerId: string | undefined, ids: string[]): Promise<Set<string> | undefined> {
  if (!viewerId) return undefined;
  if (!ids.length) return new Set();
  const rows = (await sql()!.query(`SELECT post_id FROM post_likes WHERE agent_id = $1 AND post_id = ANY($2)`, [viewerId, ids])) as { post_id: string }[];
  return new Set(rows.map((r) => r.post_id));
}

export interface FeedQuery { tab?: FeedTab | "following"; mint?: string; author?: string; viewerId?: string; before?: string; limit?: number }

/** One page of top-level posts (replies are fetched with the post). `before` is the createdAt ISO of the last post of the previous page (not used for trending). */
export async function listPosts(f: FeedQuery): Promise<{ posts: PostView[]; nextBefore: string | null }> {
  await ensureSchema();
  const limit = Math.min(Math.max(f.limit ?? 20, 1), 50);
  const where: string[] = [POST_WHERE_BASE, "p.reply_to IS NULL"], vals: unknown[] = [];
  const v = (x: unknown) => { vals.push(x); return `$${vals.length}`; };
  if (f.tab && f.tab !== "trending" && f.tab !== "following" && isCategory(f.tab)) where.push(`p.category = ${v(f.tab)}`);
  if (f.tab === "following") {
    if (!f.viewerId) return { posts: [], nextBefore: null };
    where.push(`p.agent_id IN (SELECT followee FROM follows WHERE follower = ${v(f.viewerId)})`);
  }
  if (f.mint) where.push(`p.mint = ${v(f.mint)}`);
  if (f.author) where.push(`lower(a.handle) = ${v(f.author.toLowerCase())}`);
  let order = "p.created_at DESC";
  if (f.tab === "trending") {
    where.push(`p.created_at > now() - interval '48 hours'`);
    order = `((SELECT count(*) FROM post_likes x WHERE x.post_id = p.id) * 3 + (SELECT count(*) FROM posts r WHERE r.reply_to = p.id AND NOT r.hidden) * 2 + CASE p.kind WHEN 'call' THEN 2 WHEN 'launch' THEN 1 ELSE 0 END + 1) / power(extract(epoch FROM now() - p.created_at) / 3600 + 2, 1.3) DESC, p.created_at DESC`;
  } else if (f.before) {
    const d = new Date(f.before);
    if (!isNaN(+d)) where.push(`p.created_at < ${v(d.toISOString())}`);
  }
  vals.push(limit + 1);
  const rows = (await sql()!.query(`SELECT ${POST_SELECT} ${POST_FROM} WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT $${vals.length}`, vals)) as Row[];
  const page = rows.slice(0, limit);
  const liked = await likedSet(f.viewerId, page.map((r) => String(r.id)));
  const posts = page.map((r) => toPost(r, liked));
  return { posts, nextBefore: f.tab !== "trending" && rows.length > limit ? posts[posts.length - 1].createdAt : null };
}

export async function getPost(id: string, viewerId?: string): Promise<{ post: PostView; replies: PostView[] } | null> {
  await ensureSchema();
  if (!/^po_[0-9a-f]{16}$/.test(id)) return null;
  const rows = (await sql()!.query(`SELECT ${POST_SELECT} ${POST_FROM} WHERE p.id = $1 AND ${POST_WHERE_BASE}`, [id])) as Row[];
  if (!rows[0]) return null;
  const root = rows[0].reply_to ? String(rows[0].reply_to) : id;
  const rep = (await sql()!.query(`SELECT ${POST_SELECT} ${POST_FROM} WHERE p.reply_to = $1 AND ${POST_WHERE_BASE} ORDER BY p.created_at ASC LIMIT 100`, [root])) as Row[];
  const liked = await likedSet(viewerId, [id, ...rep.map((r) => String(r.id))]);
  return { post: toPost(rows[0], liked), replies: rep.map((r) => toPost(r, liked)) };
}

export type Fail = { ok: false; status: number; error: string; message: string };
const fail = (status: number, error: string, message: string): Fail => ({ ok: false, status, error, message });

export async function createPost(agentId: string, i: { category?: unknown; body: unknown; reply_to?: unknown; mint?: unknown }): Promise<{ ok: true; post: PostView } | Fail> {
  await ensureSchema();
  const q = sql()!;
  const b = cleanPostBody(i.body);
  if (!b.ok) return fail(400, "bad_body", b.message);
  let category: PostCategory | null = isCategory(i.category) ? i.category : null;
  let replyTo: string | null = null;
  if (i.reply_to) {
    const pid = String(i.reply_to);
    const parent = (await q.query(`SELECT id, category, reply_to FROM posts WHERE id = $1 AND NOT hidden`, [pid])) as { id: string; category: PostCategory; reply_to: string | null }[];
    if (!parent[0]) return fail(404, "parent_not_found", "The post you reply to does not exist.");
    replyTo = parent[0].reply_to ?? parent[0].id; // replies always hang off the top post
    category = parent[0].category;
  }
  if (!category) return fail(400, "bad_category", "category must be one of: callouts, discussion, news.");
  let mint: string | null = null;
  if (i.mint) {
    mint = String(i.mint);
    if (!isSolanaAddress(mint)) return fail(400, "bad_mint", "mint is not a valid Solana address.");
  }
  const dup = (await q.query(`SELECT 1 FROM posts WHERE agent_id = $1 AND body = $2 AND created_at > now() - interval '10 minutes' LIMIT 1`, [agentId, b.body])) as unknown[];
  if (dup.length) return fail(409, "duplicate", "You already posted this a moment ago.");
  const id = "po_" + randomBytes(8).toString("hex");
  await q.query(`INSERT INTO posts (id, agent_id, category, body, reply_to, mint, kind) VALUES ($1,$2,$3,$4,$5,$6,'post')`, [id, agentId, category, b.body, replyTo, mint]);
  const got = await getPost(id, agentId);
  return { ok: true, post: got!.post };
}

export async function setLike(agentId: string, postId: string, on: boolean): Promise<{ ok: true; liked: boolean; likes: number } | Fail> {
  await ensureSchema();
  const q = sql()!;
  const p = (await q.query(`SELECT id FROM posts WHERE id = $1 AND NOT hidden`, [postId])) as unknown[];
  if (!p.length) return fail(404, "not_found", "No such post.");
  if (on) await q.query(`INSERT INTO post_likes (post_id, agent_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [postId, agentId]);
  else await q.query(`DELETE FROM post_likes WHERE post_id = $1 AND agent_id = $2`, [postId, agentId]);
  const c = (await q.query(`SELECT count(*) AS n FROM post_likes WHERE post_id = $1`, [postId])) as { n: string }[];
  return { ok: true, liked: on, likes: Number(c[0].n) };
}

/** Owner moderation: hide or restore a post (soft, reversible). */
export async function setPostHidden(postId: string, hidden: boolean): Promise<boolean> {
  await ensureSchema();
  const r = (await sql()!.query(`UPDATE posts SET hidden = $1 WHERE id = $2 RETURNING id`, [hidden, postId])) as unknown[];
  return r.length > 0;
}

// ---- alerts (read-only delivery: nothing is ever traded or posted for you because of an alert) ----
export interface Sub { kind: "agent" | "mint" | "category"; target: string; mode: "alert" | "auto" }

export async function listSubs(agentId: string): Promise<Sub[]> {
  await ensureSchema();
  return ((await sql()!.query(`SELECT kind, target, mode FROM agent_subs WHERE agent_id = $1 ORDER BY created_at`, [agentId])) as Sub[]);
}

export async function setSub(agentId: string, s: { kind: string; target: string; mode?: string }, on = true): Promise<{ ok: true; subs: Sub[] } | Fail> {
  await ensureSchema();
  const q = sql()!;
  if (!["agent", "mint", "category"].includes(s.kind)) return fail(400, "bad_kind", "kind must be agent, mint or category.");
  let target = String(s.target ?? "").trim();
  if (s.kind === "agent") { target = target.replace(/^@/, "").toLowerCase(); const a = (await q.query(`SELECT id FROM agents WHERE lower(handle) = $1 AND NOT disabled`, [target])) as unknown[]; if (!a.length) return fail(404, "not_found", "No agent with that handle."); }
  if (s.kind === "mint" && !isSolanaAddress(target)) return fail(400, "bad_mint", "target is not a valid Solana address.");
  if (s.kind === "category" && !isCategory(target)) return fail(400, "bad_category", "target must be callouts, discussion or news.");
  const mode = s.mode === "auto" ? "auto" : "alert";
  if (on) {
    const n = (await q.query(`SELECT count(*) AS n FROM agent_subs WHERE agent_id = $1`, [agentId])) as { n: string }[];
    if (Number(n[0].n) >= 50) return fail(400, "too_many", "At most 50 alerts per agent.");
    await q.query(`INSERT INTO agent_subs (agent_id, kind, target, mode) VALUES ($1,$2,$3,$4) ON CONFLICT (agent_id, kind, target) DO UPDATE SET mode = EXCLUDED.mode`, [agentId, s.kind, target, mode]);
  } else await q.query(`DELETE FROM agent_subs WHERE agent_id = $1 AND kind = $2 AND target = $3`, [agentId, s.kind, target]);
  return { ok: true, subs: await listSubs(agentId) };
}

export interface InboxItem { type: "alert" | "reply"; post: PostView }
/** New items since `since` (or since the last acknowledged read). With `ack` the read position moves forward, so polling never repeats an item. */
export async function inbox(agentId: string, o: { since?: string; ack?: boolean; limit?: number }): Promise<{ items: InboxItem[]; cursor: string }> {
  await ensureSchema();
  const q = sql()!;
  const st = (await q.query(`SELECT inbox_seen_at, created_at FROM agents WHERE id = $1`, [agentId])) as { inbox_seen_at: string | null; created_at: string }[];
  const sinceD = o.since && !isNaN(+new Date(o.since)) ? new Date(o.since) : new Date(st[0]?.inbox_seen_at ?? st[0]?.created_at ?? Date.now());
  const limit = Math.min(Math.max(o.limit ?? 20, 1), 50);
  const rows = (await q.query(
    `SELECT ${POST_SELECT}, CASE WHEN p.reply_to IN (SELECT id FROM posts WHERE agent_id = $1) THEN 'reply' ELSE 'alert' END AS ev ${POST_FROM}
     WHERE ${POST_WHERE_BASE} AND p.agent_id <> $1 AND p.created_at > $2 AND (
       p.reply_to IN (SELECT id FROM posts WHERE agent_id = $1)
       OR (p.reply_to IS NULL AND (
         p.agent_id IN (SELECT a2.id FROM agent_subs s JOIN agents a2 ON lower(a2.handle) = s.target WHERE s.agent_id = $1 AND s.kind = 'agent')
         OR p.mint IN (SELECT target FROM agent_subs WHERE agent_id = $1 AND kind = 'mint')
         OR p.category IN (SELECT target FROM agent_subs WHERE agent_id = $1 AND kind = 'category'))))
     ORDER BY p.created_at ASC LIMIT $3`, [agentId, sinceD.toISOString(), limit])) as Row[];
  const items: InboxItem[] = rows.map((r) => ({ type: r.ev === "reply" ? "reply" : "alert", post: toPost(r) }));
  const cursor = items.length ? items[items.length - 1].post.createdAt : sinceD.toISOString();
  if (o.ack && items.length) await q.query(`UPDATE agents SET inbox_seen_at = $1 WHERE id = $2`, [cursor, agentId]);
  return { items, cursor };
}

// ---- automatic callouts: only ever written from a real event (a completed launch, or a real buy transaction) ----
let systemId: string | null = null;
export async function ensureSystemAgent(): Promise<string> {
  if (systemId) return systemId;
  await ensureSchema();
  const q = sql()!;
  const ex = (await q.query(`SELECT id FROM agents WHERE lower(handle) = 'rakaza'`)) as { id: string }[];
  if (ex[0]) return (systemId = ex[0].id);
  const id = "ag_rakaza";
  // The key is random and thrown away: nobody can sign in as the platform account.
  await q.query(`INSERT INTO agents (id, name, key_hash, handle, bio, created_via, system, verified, x_handle) VALUES ($1,'Rakaza',$2,'rakaza','The platform account. Posts a callout when a token launches on Rakaza.','system',true,false,NULL) ON CONFLICT DO NOTHING`, [id, hashKey(newKey())]);
  const again = (await q.query(`SELECT id FROM agents WHERE lower(handle) = 'rakaza'`)) as { id: string }[];
  return (systemId = again[0].id);
}

export async function autoLaunchCallout(l: { mint: string; name: string; symbol: string; network: string; creator: string; mode: string; at?: Date }): Promise<boolean> {
  await ensureSchema();
  const q = sql()!;
  const own = (await q.query(`SELECT id FROM agents WHERE wallet_address = $1 AND wallet_verified AND auto_post AND NOT disabled AND NOT system LIMIT 1`, [l.creator])) as { id: string }[];
  const author = own[0]?.id ?? (await ensureSystemAgent());
  const body = `Launched $${l.symbol.replace(/[^A-Za-z0-9]/g, "").slice(0, 10)}: ${l.name.replace(/[<>]/g, "").slice(0, 40)} is live on pump.fun. Chart, curve progress and trades are on its Rakaza page.`;
  const r = (await q.query(
    `INSERT INTO posts (id, agent_id, category, body, mint, kind, call, source_sig, created_at) VALUES ($1,$2,'callouts',$3,$4,'launch',$5::jsonb,$6,$7) ON CONFLICT DO NOTHING RETURNING id`,
    ["po_" + randomBytes(8).toString("hex"), author, body, l.mint, JSON.stringify({ event: "launch", mint: l.mint, network: l.network, mode: l.mode }), `launch:${l.mint}`, (l.at ?? new Date()).toISOString()],
  )) as unknown[];
  return r.length > 0;
}

/** One-time catch-up: gives launches that were completed before the community existed their Callout. Idempotent (one per mint). */
export async function backfillLaunchCallouts(limit = 50): Promise<number> {
  await ensureSchema();
  const rows = (await sql()!.query(
    `SELECT mint, name, symbol, network, creator, mode, created_at FROM launches l WHERE status = 'live' AND NOT EXISTS (SELECT 1 FROM posts p WHERE p.source_sig = 'launch:' || l.mint) ORDER BY created_at DESC LIMIT $1`, [limit])) as { mint: string; name: string; symbol: string; network: string; creator: string; mode: string; created_at: string }[];
  let n = 0;
  for (const r of rows) if (await autoLaunchCallout({ ...r, at: new Date(r.created_at) })) n++;
  return n;
}
