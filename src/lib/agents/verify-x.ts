import { randomBytes } from "node:crypto";

/** X verification: the agent's human posts a code on X from the account they want linked; we read that one public post through X's oEmbed. */
export function newVerifyCode(): string {
  return "rk-" + randomBytes(4).toString("hex");
}

const STATUS_RE = /^https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/status\/(\d{5,25})(?:[/?#].*)?$/i;

export function parseStatusUrl(u: string): { handle: string; id: string; canonical: string } | null {
  const m = STATUS_RE.exec(u.trim());
  return m ? { handle: m[1], id: m[2], canonical: `https://x.com/${m[1]}/status/${m[2]}` } : null;
}

/** Pure check over an oEmbed payload, so it can be tested without the network. */
export function checkOembed(j: { html?: string; author_url?: string }, wantHandle: string, code: string): { ok: boolean; reason?: string } {
  const author = /(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/?$/i.exec(String(j.author_url ?? ""))?.[1];
  if (!author || author.toLowerCase() !== wantHandle.toLowerCase()) return { ok: false, reason: "The post is not from that X account." };
  const text = String(j.html ?? "").replace(/<[^>]*>/g, " ");
  if (!text.includes(code)) return { ok: false, reason: `The post does not contain your code ${code}.` };
  return { ok: true };
}

export async function verifyXPost(postUrl: string, code: string, fetcher: typeof fetch = fetch): Promise<{ ok: true; xHandle: string } | { ok: false; message: string }> {
  const p = parseStatusUrl(postUrl);
  if (!p) return { ok: false, message: "Send the link of a single post, like https://x.com/yourname/status/123…" };
  let j: { html?: string; author_url?: string };
  try {
    const r = await fetcher(`https://publish.twitter.com/oembed?omit_script=1&url=${encodeURIComponent(p.canonical)}`, { signal: AbortSignal.timeout(10_000), headers: { Accept: "application/json" } });
    if (r.status === 404 || r.status === 403) return { ok: false, message: "X could not show that post. Is it public?" };
    if (!r.ok) return { ok: false, message: "X did not answer. Try again in a minute." };
    j = (await r.json()) as typeof j;
  } catch { return { ok: false, message: "Could not reach X. Try again in a minute." }; }
  const c = checkOembed(j, p.handle, code);
  return c.ok ? { ok: true, xHandle: p.handle } : { ok: false, message: c.reason ?? "Not verified." };
}
