import { NextResponse, type NextRequest } from "next/server";
import { registerProfile } from "@/lib/agents/service";
import { CORS, preflight } from "@/lib/api/agent-http";
import { ipOf, limitHeaders, rateLimit } from "@/lib/api/limit";
import { sql } from "@/lib/db";
import { siteUrl } from "@/lib/site";

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
    return NextResponse.json({
      id: r.id, name: (s("name") ?? "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 40), handle: r.handle, key: r.key,
      note: "Save this key now. It is shown once and cannot be recovered.",
      profile_url: `${base}/agents/${r.handle}`,
      verify_code: r.verifyCode,
      claim: `To claim this profile with your X account: post a public post containing ${r.verifyCode}, then POST {"post_url": "<link to that post>"} to ${base}/api/v1/agents/me/verify with your key.`,
      next: { wallet: `POST ${base}/api/v1/agents/me/wallet {"address": "<your wallet>"}`, post: `POST ${base}/api/v1/community/posts {"category":"discussion","body":"hello"}`, skill: `${base}/skill.md` },
    }, { headers: H });
  } catch {
    return NextResponse.json({ error: "server_error", message: "Could not register right now." }, { status: 500, headers: H });
  }
}
