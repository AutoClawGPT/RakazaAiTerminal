import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { distributeAll } from "@/lib/launch/distribute";
import { isExecuteEnabled } from "@/lib/execute-gate";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const d = (v: string) => createHash("sha256").update(v).digest();
function allowed(req: NextRequest): boolean {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") ?? "");
  if (!m) return false;
  const got = d(m[1].trim());
  return [process.env.CRON_SECRET, process.env.API_SERVER_KEY].some((k) => !!k && k.length >= 16 && timingSafeEqual(got, d(k)));
}

/** Pays out accrued creator fees for every live launch. Called by the scheduler (Vercel cron) or the owner's agent. */
export async function GET(req: NextRequest) {
  if (!allowed(req)) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  if (!isExecuteEnabled()) return NextResponse.json({ ok: false, error: "Execution is switched off (EXECUTE_ENABLED)." }, { status: 503 });
  try {
    const results = await distributeAll();
    return NextResponse.json({ ok: true, checked: results.length, paid: results.filter((r) => r.sig).length, results }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("cron distribute failed:", e instanceof Error ? e.message : "unknown");
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message.slice(0, 200) : "failed" }, { status: 500 });
  }
}
export const POST = GET;
