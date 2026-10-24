import { isSolanaAddress } from "./address";

export interface KitInput {
  name: string;
  ticker: string;
  description: string;
  image: string;
  website: string;
  twitter: string;
  telegram: string;
  ca: string;
  devBuy: string;
}

export const emptyKit: KitInput = { name: "", ticker: "", description: "", image: "", website: "", twitter: "", telegram: "", ca: "", devBuy: "" };
export const IMAGE_PLACEHOLDER = "PASTE_IMAGE_URL_AFTER_UPLOAD";

export const cleanTicker = (t: string) => t.trim().replace(/^\$+/, "").replace(/\s+/g, "").toUpperCase();
export const shortCa = (ca: string) => (ca.length > 10 ? `${ca.slice(0, 4)}…${ca.slice(-4)}` : ca);

/** Metadata JSON in the shape pump.fun's launcher reads. Empty links are left out. */
export function buildMetadata(k: KitInput) {
  const m: Record<string, string | boolean> = {
    name: k.name.trim(),
    symbol: cleanTicker(k.ticker),
    description: k.description.trim(),
    image: k.image.trim() || IMAGE_PLACEHOLDER,
    showName: true,
    createdOn: "https://pump.fun",
  };
  if (k.twitter.trim()) m.twitter = k.twitter.trim();
  if (k.telegram.trim()) m.telegram = k.telegram.trim();
  if (k.website.trim()) m.website = k.website.trim();
  return m;
}

/** A plain template launch post (no AI). Trimmed to fit 280 characters. */
export function buildThread(k: KitInput): { posts: string[]; lengths: number[]; ok: boolean } {
  const t = cleanTicker(k.ticker);
  const tag = t ? `$${t}` : "$TICKER";
  const ca = k.ca.trim() ? shortCa(k.ca.trim()) : "";
  const desc = k.description.trim().replace(/\s+/g, " ");
  const first = [`${tag} is live on pump.fun.`, desc, ca ? `CA: ${k.ca.trim()}` : ""].filter(Boolean).join("\n\n");
  const posts = [first.length <= 280 ? first : `${tag} is live on pump.fun.\n\n${desc.slice(0, 280 - 40 - (ca ? 14 : 0)).trimEnd()}…${ca ? `\n\nCA: ${ca}` : ""}`.slice(0, 280)];
  if (k.ca.trim() && first.length > 280) posts.push(`Full contract address:\n${k.ca.trim()}\n\nAlways compare the full address, not just the ends.`);
  const lengths = posts.map((p) => p.length);
  return { posts, lengths, ok: lengths.every((n) => n <= 280) };
}

export type CheckId = "grind" | "shield" | "backup" | "lab" | "splits" | "image" | "meta" | "thread" | "radar";
export const CHECKLIST: { id: CheckId; label: string; manual: boolean }[] = [
  { id: "grind", label: "Custom address ground (optional)", manual: true },
  { id: "shield", label: "Clone cost checked in Shield", manual: true },
  { id: "backup", label: "Secret key backed up offline", manual: true },
  { id: "lab", label: "Launch simulated in the Lab", manual: true },
  { id: "splits", label: "Fee split checked (70 / 30)", manual: true },
  { id: "image", label: "Image ready", manual: false },
  { id: "meta", label: "Name, ticker and description filled in", manual: false },
  { id: "thread", label: "Launch post fits 280 characters", manual: false },
  { id: "radar", label: "Looked for copycats of your ticker", manual: true },
];

export function autoChecks(k: KitInput): Partial<Record<CheckId, boolean>> {
  return {
    image: /^https?:\/\/|^ipfs:\/\//.test(k.image.trim()),
    meta: Boolean(k.name.trim() && cleanTicker(k.ticker) && k.description.trim()),
    thread: buildThread(k).ok && Boolean(cleanTicker(k.ticker)),
    ...(k.ca.trim() ? { grind: isSolanaAddress(k.ca) } : {}),
  };
}
