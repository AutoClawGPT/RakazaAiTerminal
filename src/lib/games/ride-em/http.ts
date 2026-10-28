import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { bearerAgent, cookieAgent, CORS, isBadJson, NO_STORE, readJson } from "@/lib/api/agent-http";
import { runAction } from "@/lib/api/agent-actions";
import { limitHeaders, rateLimit } from "@/lib/api/limit";
import type { AgentRow } from "@/lib/agents/service";
import { byoDetectFor, byoTestFor, chatWithAgent, getState, me, putState, relayFor, saveSetup } from "./agent-setup";
import { dropStatus, getRun, leaderboard, registry } from "./service";

/**
 * REST for the game. One handler serves both URL families:
 *   /api/public/games/ride-em/*   (cookie from the web login, or Bearer rk_/rkb_ key)
 *   /api/v1/games/ride-em/*       (Bearer key, the documented agent API)
 * Public reads (leaderboard, run, agents, drop) need no login; starting and submitting a run always do.
 */
type Auth = { agent: AgentRow; headers: Record<string, string> } | { response: NextResponse } | null;

const hasBearer = (req: Request) => /^Bearer\s+\S+/i.test(req.headers.get("authorization") ?? "");

async function authOf(req: NextRequest, write: boolean, optional: boolean): Promise<Auth> {
  if (hasBearer(req)) {
    const a = await bearerAgent(req);
    if ("response" in a) return optional ? null : a;
    return { agent: a.agent, headers: a.headers };
  }
  const c = await cookieAgent(req, { write });
  if ("response" in c) return optional ? null : c;
  return { agent: c.agent, headers: {} };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => NextResponse.json(body, { status, headers: { ...NO_STORE, ...headers } });

function act(a: { agent: AgentRow; headers: Record<string, string> }, action: string, input: unknown) {
  return runAction(action, a.agent, input).then((r) => NextResponse.json(r.body, { status: r.status, headers: { ...NO_STORE, ...a.headers, ...(r.limit ? limitHeaders(r.limit) : {}) } }));
}

/** The shape the game's own adapter expects from /lb: { top:[{name,metres,coins,score,pro,ts}], count }. */
function adapterBoard(b: Record<string, unknown>) {
  const top = (b.top as { handle: string; distance: number; coins: number; score: number; at: string; mode: string }[] | undefined) ?? [];
  return { ...b, top: top.map((r) => ({ name: r.handle, metres: r.distance, coins: r.coins, score: r.score, pro: true, ts: Math.floor(new Date(r.at).getTime() / 1000), mode: r.mode })) };
}

export async function handleGames(req: NextRequest, path: string[], method: "GET" | "POST"): Promise<NextResponse> {
  const [a, b] = path;
  const sp = req.nextUrl.searchParams;
  const cors = hasBearer(req) ? CORS : {};
  const route = `${a ?? ""}${b ? "/" + b : ""}`;

  if (method === "GET" && (route === "leaderboard" || route === "lb")) {
    const au = await authOf(req, false, true);
    const viewer = au && "agent" in au ? au.agent.id : null;
    const seedDay = sp.get("seed");
    const range = route === "lb" && seedDay ? "daily" : sp.get("range") ?? undefined;
    const r = await leaderboard({ range, day: seedDay ?? sp.get("day") ?? undefined, mode: sp.get("mode") ?? undefined, limit: sp.get("limit") ? Number(sp.get("limit")) : undefined, viewerId: viewer, since: sp.get("since") });
    const body = route === "lb" ? adapterBoard(r.body) : r.body;
    // anonymous reads can sit on the CDN for a couple of seconds: a crowd of viewers costs one database read
    const cache = viewer ? NO_STORE : { "Cache-Control": "public, s-maxage=2, stale-while-revalidate=6" };
    return NextResponse.json(body, { status: r.status, headers: { ...cache, ...cors } });
  }
  if (method === "GET" && a === "run" && b) { const r = await getRun(b); return json(r.body, r.status, cors); }
  if (method === "GET" && a === "agents") { const r = await registry(); return NextResponse.json(r.body, { status: r.status, headers: { "Cache-Control": "public, s-maxage=5, stale-while-revalidate=15", ...cors } }); }
  if (method === "GET" && a === "drop") { const au = await authOf(req, false, true); const r = await dropStatus(au && "agent" in au ? au.agent : null); return json(r.body, r.status, cors); }

  if (method === "GET" && a === "plays") {
    const au = await authOf(req, false, false);
    if (au && "response" in au) return au.response;
    return act(au!, "game_plays_left", {});
  }
  if (method === "POST" && a === "plays") { // the game's own practice counter pings this; the real count only moves when a ranked run starts
    const au = await authOf(req, true, false);
    if (au && "response" in au) return au.response;
    return act(au!, "game_plays_left", {});
  }
  if (method === "POST" && a === "runs" && (b === "start" || b === "submit")) {
    const au = await authOf(req, true, false);
    if (au && "response" in au) return au.response;
    const input = await readJson(req);
    if (isBadJson(input)) return json({ error: "bad_json", message: "Send a JSON body." }, 400, { ...au!.headers });
    return act(au!, b === "start" ? "game_start_run" : "game_submit_run", input);
  }
  // ---- /agents/me game setup (per agent id; the BYO key only ever travels in x-byo-key for one call and is never stored or logged)
  if ((a === "me" || a === "config" || a === "state" || a === "chat" || a === "byo") && (method === "GET" ? a === "me" || a === "state" : true)) {
    const write = method === "POST";
    const au = await authOf(req, write, false);
    if (au && "response" in au) return au.response;
    const ag = au!.agent, h = { ...au!.headers, ...cors };
    const key = (req.headers.get("x-byo-key") ?? "").slice(0, 400);
    const lim = async (scope: string, max: number) => { const l = await rateLimit(`games:${scope}`, ag.id, max, 1, "m"); return l.ok ? null : json({ error: "rate_limited", message: "Slow down a little and try again." }, 429, { ...h, ...limitHeaders(l) }); };
    if (method === "GET" && a === "me") { const r = await me(ag); return json(r.body, r.status, h); }
    if (method === "GET" && a === "state") { const r = await getState(ag); return json(r.body, r.status, h); }
    if (method === "POST") {
      const input = await readJson(req);
      if (isBadJson(input)) return json({ error: "bad_json", message: "Send a JSON body." }, 400, h);
      const body = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
      if (a === "config") { const r = await saveSetup(ag, body); return json(r.body, r.status, h); }
      if (a === "state") { const l = await lim("state", 60); if (l) return l; const r = await putState(ag, body); return json(r.body, r.status, h); }
      if (a === "chat") { const l = await lim("chat", 20); if (l) return l; const r = await chatWithAgent(ag, body, key); return json(r.body, r.status, h); }
      if (a === "byo" && b === "test") { const l = await lim("byotest", 20); if (l) return l; const r = await byoTestFor(body, key); return json(r.body, r.status, h); }
      if (a === "byo" && b === "detect") { const l = await lim("byodetect", 20); if (l) return l; const r = await byoDetectFor(body, key); return json(r.body, r.status, h); }
      if (a === "byo" && b === "relay") { const l = await lim("byorelay", 240); if (l) return l; const r = await relayFor(body, key); return json(r.body, r.status, h); }
    }
  }
  return json({ error: "not_found", message: "No such games route. See /skill.md#games.", routes: ["GET leaderboard", "GET plays", "POST runs/start", "POST runs/submit", "GET run/{id}", "GET me", "POST config", "GET|POST state", "POST chat", "POST byo/test", "POST byo/detect"] }, 404, cors);
}
