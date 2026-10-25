import { NextResponse, type NextRequest } from "next/server";
import { CORS, preflight } from "@/lib/api/agent-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;
const JSON_HEADERS = { ...CORS, "Cache-Control": "public, max-age=10, s-maxage=20, stale-while-revalidate=60" };
const nf = () => NextResponse.json({ error: "not_found", message: "Not found." }, { status: 404, headers: { ...CORS, "Cache-Control": "no-store" } });
import { listPosts } from "@/lib/community/service";
import { isFeedTab } from "@/lib/community/text";
import { sql } from "@/lib/db";

export async function GET(req: NextRequest) {
  if (!sql()) return NextResponse.json({ posts: [], nextBefore: null }, { headers: JSON_HEADERS });
  const sp = req.nextUrl.searchParams;
  const tab = isFeedTab(sp.get("tab")) ? (sp.get("tab") as never) : undefined;
  try {
    return NextResponse.json(await listPosts({ tab, mint: sp.get("mint") ?? undefined, author: sp.get("author") ?? undefined, before: sp.get("before") ?? undefined, limit: Number(sp.get("limit")) || 20 }), { headers: JSON_HEADERS });
  } catch { return NextResponse.json({ error: "server_error", message: "Try again." }, { status: 500, headers: CORS }); }
}
