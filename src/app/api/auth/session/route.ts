import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Read-only: is the browser holding a valid owner session? Never returns the cookie or any secret. */
export function GET(req: NextRequest) {
  const owner = verifySession(req.cookies.get(SESSION_COOKIE)?.value, process.env.SESSION_SECRET);
  return NextResponse.json({ owner }, { headers: { "Cache-Control": "no-store" } });
}
