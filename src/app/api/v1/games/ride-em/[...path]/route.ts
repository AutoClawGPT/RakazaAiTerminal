import { type NextRequest } from "next/server";
import { preflight } from "@/lib/api/agent-http";
import { handleGames } from "@/lib/games/ride-em/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export const OPTIONS = preflight;

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) { return handleGames(req, (await ctx.params).path, "GET"); }
export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) { return handleGames(req, (await ctx.params).path, "POST"); }
