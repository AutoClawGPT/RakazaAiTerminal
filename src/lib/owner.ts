import "server-only";

/**
 * Who may use owner-only server actions.
 * Phases 1-4: only the local dev preview (never in production).
 * Phase 5 replaces this with the signed owner-session cookie check.
 */
export async function isOwnerRequest(): Promise<boolean> {
  return process.env.NODE_ENV !== "production" && process.env.DEV_PREVIEW_OWNER_PAGES === "true";
}
