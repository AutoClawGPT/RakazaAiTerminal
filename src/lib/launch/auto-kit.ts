import { CHECKLIST, buildThread, cleanTicker, type CheckId } from "@/lib/tools/kit";
import { isSolanaAddress } from "@/lib/tools/address";

/** What the Agent Launch flow knows so far. Every tick is earned from this, nothing is ticked by hand. */
export interface AutoState {
  vampScanned: boolean;
  /** Ground vanity mint used (its address) or null. */
  groundMint: string | null;
  riskLevel: "low" | "medium" | "high" | null;
  imageUrl: string;
  uri: string;
  name: string;
  ticker: string;
  description: string;
  thread: string[];
  /** The dry run of the exact launch transaction passed. */
  dryRunOk: boolean;
  /** The 70/30 split was built and checked for this launch. */
  splitChecked: boolean;
  /** The one-time mint key was sealed on the server for this launch. */
  mintSealed: boolean;
}

export type KitState = "done" | "optional" | "pending";
export interface KitItem { id: CheckId; label: string; state: KitState; detail: string }

export const POST_MAX = 280;

/** Fills in the {CA} placeholder. Falls back to a short note before the mint exists. */
export function fillCa(posts: string[], ca: string): string[] {
  return posts.map((p) => p.replaceAll("{CA}", ca || "(CA after launch)"));
}

/** The 9-item Launch Kit, same items as the Kit tab, ticked from real results. */
export function autoKit(s: AutoState): KitItem[] {
  const threadOk = s.thread.length > 0 && fillCa(s.thread, "x".repeat(44)).every((p) => p.length <= POST_MAX) && Boolean(cleanTicker(s.ticker));
  const metaOk = Boolean(s.name.trim() && cleanTicker(s.ticker) && s.description.trim());
  const hasUri = /^(https:\/\/|ipfs:\/\/)/.test(s.uri);
  const t: Record<CheckId, { ok: boolean; optional?: boolean; yes: string; no: string }> = {
    grind: { ok: !!s.groundMint && isSolanaAddress(s.groundMint), optional: true, yes: `Ground address ${s.groundMint?.slice(0, 4)}…${s.groundMint?.slice(-4)}`, no: "Not used. A normal random address is fine." },
    shield: { ok: s.vampScanned, yes: "Vamp Shield and Radar scan done on the source token.", no: "Waiting for the scan." },
    backup: { ok: s.mintSealed, yes: "The one-time mint key is sealed on the server and used once. A ground key stays in your own file.", no: "Made when the launch is prepared." },
    lab: { ok: s.dryRunOk, yes: "Dry run of the real transaction passed.", no: "Runs when the launch is prepared." },
    splits: { ok: s.splitChecked, yes: "Fee split checked: 70% you, 30% platform, permanent.", no: "Checked when the launch is prepared." },
    image: { ok: /^https?:\/\/|^ipfs:\/\//.test(s.imageUrl), yes: "Image made and pinned to IPFS.", no: "Waiting for the image and upload." },
    meta: { ok: metaOk && hasUri, yes: "Name, ticker and description pinned as metadata JSON.", no: "Waiting for the metadata upload." },
    thread: { ok: threadOk, yes: `${s.thread.length} posts, each within ${POST_MAX} characters.`, no: "Waiting for the thread." },
    radar: { ok: s.riskLevel === "low", yes: "No strong copycat of the new name or ticker found.", no: s.riskLevel ? `Copy risk is ${s.riskLevel}. Redo with River.` : "Waiting for the copycat check." },
  };
  return CHECKLIST.map((c) => {
    const r = t[c.id];
    return { id: c.id, label: c.label, state: r.ok ? "done" : r.optional ? "optional" : "pending", detail: r.ok ? r.yes : r.no };
  });
}

/** Plain text of the thread for the copy button. */
export function threadText(posts: string[], ca: string, name: string, ticker: string): string {
  const p = posts.length ? fillCa(posts, ca) : buildThread({ name, ticker, description: "", image: "", website: "", twitter: "", telegram: "", ca, devBuy: "" }).posts;
  return p.map((x, i) => `${i + 1}/${p.length} ${x}`).join("\n\n");
}
