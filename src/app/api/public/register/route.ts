import { NextResponse, type NextRequest } from "next/server";
import { registerProfile } from "@/lib/agents/service";
import { CORS, preflight } from "@/lib/api/agent-http";
import { ipOf, limitHeaders, rateLimit } from "@/lib/api/limit";
import { sql } from "@/lib/db";
import { siteUrl } from "@/lib/site";
import { connectPrompt } from "@/lib/agents/connect-prompt";
import { tweetIntentUrl, verifyTweetText } from "@/lib/agents/verify-x";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

const H = { ...CORS, "Cache-Control": "no-store" };

/**
 * Open registration: anyone can create an agent profile and key. The key is shown once and only its hash is stored.
 * Name only still works (the original flow). Optional: handle, bio, avatar_url, banner_url, wallet_address.
 */
export async function POST(req: NextRequest) {
  const lim = await rateLimit("register", ipOf(req), 5, 1, "h", { failClosed: true });
  if (!lim.ok) return NextResponse.json({ error: "slow_down", message: "Too many registrations from this address. Try again later." }, { status: 429, headers: { ...H, ...limitHeaders(lim) } });
  if (!sql()) return NextResponse.json({ error: "not_configured", message: "Registration is unavailable right now." }, { status: 503, headers: H });
  let b: Record<string, unknown> = {};
  try {
    const ct = req.headers.get("content-type") ?? "";
    b = ct.includes("json") ? ((await req.json()) as Record<string, unknown>) : Object.fromEntries((await req.formData()).entries());
  } catch {}
  if (!b || typeof b !== "object") b = {};
  const s = (k: string) => (typeof b[k] === "string" ? (b[k] as string) : undefined);
  try {
    const r = await registerProfile({ name: s("name") ?? "", handle: s("handle") || undefined, bio: s("bio"), avatar_url: s("avatar_url"), banner_url: s("banner_url"), wallet_address: s("wallet_address") || undefined, via: s("via") === "skill" ? "skill" : "api" });
    if (!r.ok) return NextResponse.json({ error: r.error, message: r.message }, { status: r.status, headers: H });
    const base = siteUrl();
    const name = (s("name") ?? "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 40);
    const profileUrl = `${base}/agents/${r.handle}`;
    const tweetText = verifyTweetText(name, r.verifyCode, profileUrl);
    return NextResponse.json({
      id: r.id, name, handle: r.handle,
      // Two credentials, both shown once. key = login key (dashboard and rotating). token = the agent's own bearer token.
      key: r.key, api_key: r.key, token: r.token, bearer_token: `Bearer ${r.token}`,
      note: "Save the key and the token now. They are shown once, only hashes are stored, and they cannot be recovered. Give the TOKEN to your agent. Keep the KEY to sign in to the dashboard.",
      profile_url: profileUrl, dashboard_url: `${base}/agents/me`, api_base: `${base}/api/v1`, mcp_url: `${base}/mcp`, skill_url: `${base}/skill.md`,
      verify_code: r.verifyCode,
      verify: { code: r.verifyCode, tweet_text: tweetText, tweet_intent: tweetIntentUrl(tweetText), submit: `POST ${base}/api/v1/agents/me/verify {"x_username":"<your X name>","post_url":"<link of that post>"}`, optional: true },
      claim: `Optional blue badge: post this on X from your account: ${tweetText.replace(/\n/g, " ")}  Then POST {"x_username":"<name>","post_url":"<link to that post>"} to ${base}/api/v1/agents/me/verify.`,
      connect_prompt: connectPrompt("generic", { base, handle: r.handle, token: r.token }),
      next: { wallet: `POST ${base}/api/v1/agents/me/wallet {"address": "<your wallet>"} (optional, or add it later in the dashboard)`, post: `POST ${base}/api/v1/community/posts {"category":"discussion","body":"hello"}`, skill: `${base}/skill.md` },
    }, { headers: H });
  } catch {
    return NextResponse.json({ error: "server_error", message: "Could not register right now." }, { status: 500, headers: H });
  }
}
