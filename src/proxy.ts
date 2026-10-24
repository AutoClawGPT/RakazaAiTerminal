import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { isProtectedPath } from "@/lib/routes";

/**
 * Default-deny gate (Next 16 `proxy`, Node runtime).
 *
 *  - Owner / agent PAGES   -> redirect to /login unless an owner session exists.
 *  - /api/**, /mcp          -> 401 JSON unless the route is in PUBLIC_API
 *                             or the request carries `Authorization: Bearer <API_SERVER_KEY>`.
 *  - Owner sessions are issued in Phase 5; until then none can exist.
 *  - DEV ONLY: DEV_PREVIEW_OWNER_PAGES=true lets owner stub PAGES render so they can be
 *    screenshotted. It is ignored when NODE_ENV=production and never applies to API/MCP.
 */

/** API prefixes that are public by design. Everything else under /api is denied by default. */
const PUBLIC_API = [
  "/api/health",
  "/api/auth/", // login / logout / session (Phase 5)
  "/api/chat", // public persona chat (Phase 3)
  "/api/voice", // short-lived Deepgram token + TTS (Phase 3)
  "/api/diary",
  "/api/live",
  "/api/memes",
  "/api/checker",
  "/api/public/",
];

function digest(v: string): Buffer {
  return createHash("sha256").update(v).digest();
}

function bearerOk(req: NextRequest): boolean {
  const key = process.env.API_SERVER_KEY;
  if (!key || key.length < 16) return false;
  const h = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  if (!m) return false;
  return timingSafeEqual(digest(m[1].trim()), digest(key));
}

/** Phase 5 replaces this with a signed-cookie check against SESSION_SECRET. */
function ownerSessionOk(): boolean {
  return false;
}

function isApiLike(pathname: string): boolean {
  return pathname.startsWith("/api/") || pathname === "/api" || pathname === "/mcp" || pathname.startsWith("/mcp/");
}

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const api = isApiLike(pathname);

  if (api) {
    if (PUBLIC_API.some((p) => (p.endsWith("/") ? pathname.startsWith(p) : pathname === p || pathname.startsWith(p + "/")))) {
      return NextResponse.next();
    }
    if (bearerOk(req) || ownerSessionOk()) return NextResponse.next();
    return NextResponse.json(
      { error: "unauthorized", message: "Owner session or bearer key required." },
      { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="rakaza"', "Cache-Control": "no-store" } },
    );
  }

  if (isProtectedPath(pathname)) {
    if (ownerSessionOk() || bearerOk(req)) return NextResponse.next();
    const preview = process.env.NODE_ENV !== "production" && process.env.DEV_PREVIEW_OWNER_PAGES === "true";
    if (preview) return NextResponse.next();
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    const next = pathname + search;
    if (next.startsWith("/") && !next.startsWith("//")) url.searchParams.set("next", next);
    const res = NextResponse.redirect(url, 307);
    res.headers.set("Cache-Control", "no-store");
    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|theme.js|icon.svg|brand/|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff2?|txt|xml)$).*)"],
};
