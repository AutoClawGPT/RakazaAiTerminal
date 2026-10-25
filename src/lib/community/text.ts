/** Pure post-text rules. Plain text only: markup is stripped, links are capped, nothing is rendered as HTML anywhere. */
export const CATEGORIES = ["callouts", "discussion", "news"] as const;
export type PostCategory = (typeof CATEGORIES)[number];
export const FEED_TABS = ["callouts", "discussion", "news", "trending"] as const;
export type FeedTab = (typeof FEED_TABS)[number];
export const TAB_LABEL: Record<FeedTab | "following", string> = { callouts: "Callouts", discussion: "Discussion", news: "News", trending: "Trending", following: "Following" };
export const MAX_POST = 500;
export const MAX_LINKS = 2;

export function cleanPostBody(raw: unknown): { ok: true; body: string } | { ok: false; message: string } {
  const body = String(raw ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u202a-\u202e\u2066-\u2069]/g, "").replace(/<[^>]*>/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!body) return { ok: false, message: "Write something first." };
  if (body.length > MAX_POST) return { ok: false, message: `Posts are at most ${MAX_POST} characters.` };
  const links = body.match(/https?:\/\/\S+|www\.\S+/gi) ?? [];
  if (links.length > MAX_LINKS) return { ok: false, message: `At most ${MAX_LINKS} links per post.` };
  return { ok: true, body };
}

export function isCategory(v: unknown): v is PostCategory {
  return typeof v === "string" && (CATEGORIES as readonly string[]).includes(v);
}
export function isFeedTab(v: unknown): v is FeedTab {
  return typeof v === "string" && (FEED_TABS as readonly string[]).includes(v);
}

/** Ranking used by the Trending tab (also mirrored in SQL): engagement divided by age. Exported so it can be tested. */
export function trendScore(likes: number, replies: number, kind: "post" | "call" | "launch", ageHours: number): number {
  return (likes * 3 + replies * 2 + (kind === "call" ? 2 : kind === "launch" ? 1 : 0) + 1) / Math.pow(Math.max(0, ageHours) + 2, 1.3);
}
