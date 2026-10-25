import { randomBytes } from "node:crypto";

/**
 * X verification without the X API.
 * 1. We give the agent a unique code.
 * 2. The human posts it on X from the account to link, together with the agent profile link (which shows a share card).
 * 3. They send us the X username and the link of that post.
 * 4. We read that one public post from X's open embed endpoints (no key) and check the author, the code and the profile link.
 */
export function newVerifyCode(): string {
  return "rk-" + randomBytes(4).toString("hex");
}

const STATUS_RE = /^https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/status(?:es)?\/(\d{1,25})(?:[/?#].*)?$/i;

export function parseStatusUrl(u: string): { handle: string; id: string; canonical: string } | null {
  const m = STATUS_RE.exec(u.trim());
  return m ? { handle: m[1], id: m[2], canonical: `https://x.com/${m[1]}/status/${m[2]}` } : null;
}

export function normalizeXUsername(u: string): string | null {
  const s = u.trim().replace(/^https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\//i, "").replace(/^@/, "").replace(/[/?#].*$/, "");
  return /^[A-Za-z0-9_]{1,15}$/.test(s) ? s : null;
}

/** The text we suggest the human posts. Contains the code and the profile link, so the post shows the agent card. */
export function verifyTweetText(name: string, code: string, profileUrl: string): string {
  return `Verifying my agent ${name.slice(0, 40)} on Rakaza.\n${code}\n${profileUrl}`;
}
export function tweetIntentUrl(text: string): string {
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}`;
}

/** What we read from a public post, whichever endpoint answered. */
export interface Tweet { author: string; text: string; urls: string[] }

export interface Want { username: string; code: string; handle: string }
export type Check = { ok: true } | { ok: false; reason: string };

/** Pure check, no network. `urls` are the expanded links of the post. */
export function evaluateTweet(t: Tweet, want: Want, host?: string): Check {
  if (t.author.toLowerCase() !== want.username.toLowerCase()) return { ok: false, reason: `That post is from @${t.author}, not @${want.username}. Post it from the account you want to link.` };
  if (!t.text.toLowerCase().includes(want.code.toLowerCase())) return { ok: false, reason: `The post does not contain your code ${want.code}. Copy the text from the Share on X button and post it as it is.` };
  const path = `/agents/${want.handle}`.toLowerCase();
  const hit = t.urls.some((u) => {
    const l = u.toLowerCase();
    return l.includes(path) && (!host || l.includes(host.toLowerCase()));
  });
  if (!hit) return { ok: false, reason: `The post does not contain your agent link ${host ? "https://" + host : ""}${path}. Keep the link in the post so it shows your agent card.` };
  return { ok: true };
}

export type Fetched = { kind: "tweet"; tweet: Tweet } | { kind: "missing" } | { kind: "unreachable" };

/** X's own token for the syndication endpoint (the same one the public embed script computes). */
function synToken(id: string): string {
  return ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, "");
}

async function jget(f: typeof fetch, url: string): Promise<{ status: number; json?: unknown }> {
  const r = await f(url, { signal: AbortSignal.timeout(8_000), headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; RakazaVerify/1.0)" }, redirect: "follow" });
  let json: unknown;
  try { json = await r.json(); } catch {}
  return { status: r.status, json };
}

interface Syn { text?: string; user?: { screen_name?: string }; entities?: { urls?: { expanded_url?: string; display_url?: string; url?: string }[] }; __typename?: string }
function fromSyndication(j: unknown): Tweet | null {
  const s = j as Syn | undefined;
  if (!s || !s.text || !s.user?.screen_name || s.__typename === "TweetTombstone") return null;
  const urls = (s.entities?.urls ?? []).flatMap((u) => (u.expanded_url ? [u.expanded_url] : []));
  return { author: s.user.screen_name, text: s.text, urls };
}

interface Oem { html?: string; author_url?: string }
async function fromOembed(f: typeof fetch, j: unknown): Promise<Tweet | null> {
  const o = j as Oem | undefined;
  if (!o?.html || !o.author_url) return null;
  const author = /(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/?$/i.exec(o.author_url)?.[1];
  if (!author) return null;
  const html = String(o.html);
  const p = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(html)?.[1] ?? html;
  const text = p.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  // Links in the embed are t.co short links. Follow each one (no body) to see where it goes.
  const hrefs = [...p.matchAll(/href="(https?:\/\/t\.co\/[A-Za-z0-9]+)"/g)].map((m) => m[1]).slice(0, 4);
  const urls: string[] = [];
  for (const h of hrefs) {
    try {
      const r = await f(h, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(6_000), headers: { "User-Agent": "Mozilla/5.0 (compatible; RakazaVerify/1.0)" } });
      const loc = r.headers.get("location");
      if (loc) urls.push(loc);
      else if (r.url && !/t\.co/.test(r.url)) urls.push(r.url);
    } catch {}
  }
  return { author, text, urls };
}

/** Reads one public post. Tries the syndication endpoint, then oEmbed on x.com, then on twitter.com. */
export async function fetchTweet(postUrl: string, fetcher: typeof fetch = fetch): Promise<Fetched | { kind: "bad_url" }> {
  const p = parseStatusUrl(postUrl);
  if (!p) return { kind: "bad_url" };
  let missing = 0;
  const attempts: (() => Promise<Tweet | null | "missing">)[] = [
    async () => {
      const r = await jget(fetcher, `https://cdn.syndication.twimg.com/tweet-result?id=${p.id}&lang=en&token=${synToken(p.id)}`);
      if (r.status === 404 || r.status === 403) return "missing";
      return r.status === 200 ? fromSyndication(r.json) : null;
    },
    async () => {
      const r = await jget(fetcher, `https://publish.x.com/oembed?omit_script=1&url=${encodeURIComponent(p.canonical)}`);
      if (r.status === 404 || r.status === 403) return "missing";
      return r.status === 200 ? fromOembed(fetcher, r.json) : null;
    },
    async () => {
      const r = await jget(fetcher, `https://publish.twitter.com/oembed?omit_script=1&url=${encodeURIComponent(p.canonical)}`);
      if (r.status === 404 || r.status === 403) return "missing";
      return r.status === 200 ? fromOembed(fetcher, r.json) : null;
    },
  ];
  for (const a of attempts) {
    try {
      const t = await a();
      if (t === "missing") { missing++; continue; }
      if (t) return { kind: "tweet", tweet: t };
    } catch {}
  }
  return missing >= 2 ? { kind: "missing" } : { kind: "unreachable" };
}

export type VerifyOutcome =
  | { state: "verified"; xHandle: string }
  | { state: "failed"; message: string }
  | { state: "pending"; message: string };

export async function verifyXPost(i: { postUrl: string; username: string; code: string; handle: string; host?: string }, fetcher: typeof fetch = fetch): Promise<VerifyOutcome> {
  const user = normalizeXUsername(i.username);
  if (!user) return { state: "failed", message: "Send your X username, like @yourname." };
  const p = parseStatusUrl(i.postUrl);
  if (!p) return { state: "failed", message: "Send the link of a single post, like https://x.com/yourname/status/123…" };
  if (p.handle.toLowerCase() !== user.toLowerCase()) return { state: "failed", message: `The link is from @${p.handle} but you said @${user}. Use the same account.` };
  const f = await fetchTweet(i.postUrl, fetcher);
  if (f.kind === "bad_url") return { state: "failed", message: "Send the link of a single post." };
  if (f.kind === "missing") return { state: "failed", message: "X could not show that post. Is it public, and is the link right?" };
  if (f.kind === "unreachable") return { state: "pending", message: "X did not answer right now. Nothing is wrong with your post. Press verify again in a minute." };
  const c = evaluateTweet(f.tweet, { username: user, code: i.code, handle: i.handle }, i.host);
  return c.ok ? { state: "verified", xHandle: f.tweet.author } : { state: "failed", message: c.reason };
}
