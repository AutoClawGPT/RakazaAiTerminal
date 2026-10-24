import { isSolanaAddress } from "@/lib/tools/address";

export type Intent =
  | { kind: "scan"; mint: string }
  | { kind: "draft" }
  | { kind: "image" }
  | { kind: "vanity" }
  | { kind: "split"; wallet?: string }
  | { kind: "simulate"; sol?: number }
  | { kind: "launch" }
  | { kind: "chat" };

const BASE58 = /[1-9A-HJ-NP-Za-km-z]{32,44}/g;

/** Turns what the owner says or types into one launch step. Spoken text is messy, so this stays forgiving. */
export function parseIntent(text: string): Intent {
  const t = text.toLowerCase();
  for (const m of text.match(BASE58) ?? []) {
    if (isSolanaAddress(m)) {
      if (/\b(split|fee|wallet|send fees|payout)\b/.test(t)) return { kind: "split", wallet: m };
      return { kind: "scan", mint: m };
    }
  }
  if (/\b(launch|deploy|go live|create the token|send it)\b/.test(t)) return { kind: "launch" };
  if (/\b(image|logo|picture|artwork|art)\b/.test(t)) return { kind: "image" };
  if (/\b(recreate|optimi[sz]e|improve|rename|draft|rewrite|make it better|river)\b/.test(t)) return { kind: "draft" };
  if (/\b(vanity|grind|custom address|ends with|starts with)\b/.test(t)) return { kind: "vanity" };
  if (/\b(simulate|simulation|curve|dev buy|how much)\b/.test(t)) {
    const n = t.match(/(\d+(?:\.\d+)?)\s*(?:sol)?/);
    return { kind: "simulate", sol: n ? Number(n[1]) : undefined };
  }
  if (/\b(split|fees?|70|30)\b/.test(t)) return { kind: "split" };
  return { kind: "chat" };
}
