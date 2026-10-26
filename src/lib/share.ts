/** Share on X helpers. Every Share on X link carries the page's absolute URL so the post renders the page's card. */
export const PROD_URL = "https://rakaza-ai-terminal.vercel.app";

/** Public origin used inside share links (never localhost in a production build). */
export function shareOrigin(): string {
  const env = process.env.NEXT_PUBLIC_APP_URL;
  if (env && !/localhost|127\.0\.0\.1/.test(env)) return env.replace(/\/+$/, "");
  return PROD_URL;
}

export function absUrl(path: string): string {
  return `${shareOrigin()}${path.startsWith("/") ? path : `/${path}`}`;
}

/** https://x.com/intent/post?text=...&url=<absolute page url> */
export function xIntent(text: string, pageUrl: string): string {
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(pageUrl)}`;
}
