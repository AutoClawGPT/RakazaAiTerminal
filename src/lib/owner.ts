import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";

/**
 * Who may use owner-only server actions: a valid signed owner-session cookie.
 * Local dev preview (never in production) is also allowed so pages can be tested without logging in.
 */
export async function isOwnerRequest(): Promise<boolean> {
  if (process.env.NODE_ENV !== "production" && process.env.DEV_PREVIEW_OWNER_PAGES === "true") return true;
  const jar = await cookies();
  return verifySession(jar.get(SESSION_COOKIE)?.value, process.env.SESSION_SECRET);
}
