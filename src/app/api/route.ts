import { apiIndex } from "@/lib/api/index-doc";

export const dynamic = "force-static";

const H = { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600", "Access-Control-Allow-Origin": "*" };

/** Public API index: endpoints, the auth model, and links to /skill.md, /openapi.json and /mcp. */
export function GET() {
  return Response.json(apiIndex("root"), { headers: H });
}
export function HEAD() {
  return new Response(null, { headers: { ...H, "Content-Type": "application/json" } });
}
export function OPTIONS() {
  return new Response(null, { status: 204, headers: { ...H, "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS" } });
}
