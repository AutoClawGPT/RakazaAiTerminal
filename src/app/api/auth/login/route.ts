import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getEnv } from "@/lib/env";
import { SESSION_COOKIE, SESSION_MAX_AGE_S, signSession } from "@/lib/auth/session";
import { allow } from "@/lib/auth/rate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const d = (s: string) => createHash("sha256").update(s).digest();

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!allow(`login:${ip}`, 8, 10 * 60_000)) return NextResponse.json({ error: "slow_down", message: "Too many tries. Wait a few minutes." }, { status: 429 });
  const env = getEnv();
  if (!env.DASHBOARD_PASSWORD || !env.SESSION_SECRET) return NextResponse.json({ error: "not_configured", message: "The owner password is not set on the server." }, { status: 503 });
  let pw = "";
  try {
    const ct = req.headers.get("content-type") ?? "";
    pw = ct.includes("json") ? String(((await req.json()) as { password?: string }).password ?? "") : String((await req.formData()).get("password") ?? "");
  } catch {}
  if (!pw || !timingSafeEqual(d(pw), d(env.DASHBOARD_PASSWORD))) return NextResponse.json({ error: "wrong_password", message: "That password is not right." }, { status: 401 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, signSession(env.SESSION_SECRET), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_MAX_AGE_S });
  res.headers.set("Cache-Control", "no-store");
  return res;
}
