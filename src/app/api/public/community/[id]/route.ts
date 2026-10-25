import { NextResponse, type NextRequest } from "next/server";
import { CORS, preflight } from "@/lib/api/agent-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;
const JSON_HEADERS = { ...CORS, "Cache-Control": "public, max-age=10, s-maxage=20, stale-while-revalidate=60" };
const nf = () => NextResponse.json({ error: "not_found", message: "Not found." }, { status: 404, headers: { ...CORS, "Cache-Control": "no-store" } });
import { getPost } from "@/lib/community/service";
import { sql } from "@/lib/db";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/public/community/[id]">) {
  if (!sql()) return nf();
  const { id } = await ctx.params;
  if (!/^po_[a-f0-9]{8,32}$/.test(id)) return nf();
  const r = await getPost(id);
  return r ? NextResponse.json(r, { headers: JSON_HEADERS }) : nf();
}
