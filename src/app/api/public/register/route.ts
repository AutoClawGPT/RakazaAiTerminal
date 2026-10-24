import { NextResponse, type NextRequest } from "next/server";
import { registerAgent } from "@/lib/auth/agent-keys";
import { allow } from "@/lib/auth/rate";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Open registration: anyone can create an agent key. The key is shown once and only its hash is stored. */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!allow(`reg:${ip}`, 5, 60 * 60_000)) return NextResponse.json({ error: "slow_down", message: "Too many registrations from this address. Try again later." }, { status: 429 });
  if (!sql()) return NextResponse.json({ error: "not_configured", message: "Registration is unavailable right now." }, { status: 503 });
  let name = "";
  try {
    const ct = req.headers.get("content-type") ?? "";
    name = String(ct.includes("json") ? ((await req.json()) as { name?: string }).name ?? "" : (await req.formData()).get("name") ?? "");
  } catch {}
  name = name.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 40);
  if (name.length < 2) return NextResponse.json({ error: "bad_name", message: "Give your agent a name of at least 2 characters." }, { status: 400 });
  try {
    const { id, key } = await registerAgent(name);
    return NextResponse.json({ id, name, key, note: "Save this key now. It is shown once and cannot be recovered." }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "server_error", message: "Could not register right now." }, { status: 500 });
  }
}
