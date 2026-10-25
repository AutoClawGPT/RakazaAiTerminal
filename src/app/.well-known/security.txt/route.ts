import { siteUrl } from "@/lib/site";

export const dynamic = "force-static";

/** RFC 9116. Reports go to the contact page. */
export function GET() {
  const expires = new Date(Date.UTC(new Date().getUTCFullYear() + 1, 0, 1)).toISOString();
  const body = `Contact: ${siteUrl()}/docs\nExpires: ${expires}\nPreferred-Languages: en\nCanonical: ${siteUrl()}/.well-known/security.txt\nPolicy: Please do not test with real funds or attack production. Report privately first.\n`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, s-maxage=86400" } });
}
