import "server-only";
import { NextResponse } from "next/server";
import { callTool } from "./tools";
import { gate } from "./gate";
import { CORS, NO_STORE, readJson, isBadJson } from "./agent-http";

/** REST wrapper for one agent-run launch tool: same Bearer auth, limits and answers as POST /api/v1/tools/{tool}, but with a plain REST shape. */
export async function launchRoute(req: Request, tool: string, input?: unknown): Promise<NextResponse> {
  const g = await gate(req, tool);
  if ("response" in g) { for (const [k, v] of Object.entries(CORS)) g.response.headers.set(k, v); return g.response; }
  let body: unknown = input;
  if (body === undefined) { body = await readJson(req); if (isBadJson(body)) return NextResponse.json({ error: "bad_json", message: "Send a JSON body." }, { status: 400, headers: { ...NO_STORE, ...CORS } }); }
  const r = await callTool(tool, body, g.caller);
  if (!r.ok) return NextResponse.json({ error: r.error, message: r.message }, { status: r.status, headers: { ...NO_STORE, ...CORS, ...g.headers } });
  return NextResponse.json(r.result, { headers: { ...NO_STORE, ...CORS, ...g.headers } });
}
