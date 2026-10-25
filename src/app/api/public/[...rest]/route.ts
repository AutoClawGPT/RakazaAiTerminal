import { NextResponse } from "next/server";

/** Any /api/public/* path that has no route: a JSON 404 instead of an HTML page. */
const notFound = () => NextResponse.json({ error: "not_found", message: "No such public API route. See /openapi.json." }, { status: 404, headers: { "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" } });
export const GET = notFound;
export const POST = notFound;
export const HEAD = notFound;
export const PUT = notFound;
export const DELETE = notFound;
export const PATCH = notFound;
export function OPTIONS() {
  return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "content-type", "Access-Control-Max-Age": "86400" } });
}
