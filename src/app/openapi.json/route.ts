import { openApiDoc } from "@/lib/openapi";

export const dynamic = "force-static";

export function GET() {
  return Response.json(openApiDoc(), { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600", "Access-Control-Allow-Origin": "*" } });
}
