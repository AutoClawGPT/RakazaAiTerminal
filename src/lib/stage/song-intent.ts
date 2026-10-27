/** Does this chat message ask Rakaza for a song? "sing me a song", "make me a song about X", "play a song"… */
export type SongIntent = { topic: string | null };

const ASK = [
  /\b(?:sing|rap|perform|play|make|write|create|compose|craft|give|do)\b[^.!?\n]{0,24}\b(?:song|tune|track|music|jingle|rap)\b/i,
  /\b(?:sing|rap)\b\s+(?:for\s+me|something|a\s+bit|to\s+me|me)\b/i,
  /\b(?:i\s+(?:want|wanna|would\s+like|'d\s+like)|can\s+you|could\s+you|please)\b[^.!?\n]{0,24}\b(?:sing|song)\b/i,
  /^\s*(?:sing|song)\s*[.!?]*\s*$/i,
];

export function songIntent(text: string): SongIntent | null {
  const t = text.trim().replace(/\s+/g, " ");
  if (!t || t.length > 200) return null;
  if (!ASK.some((r) => r.test(t))) return null;
  const m = /\b(?:about|on|for|of|featuring)\s+(?:the\s+|a\s+|an\s+|my\s+)?([^.!?\n,]{2,60})/i.exec(t.replace(/\b(?:for\s+me|to\s+me)\b/gi, ""));
  const topic = m ? m[1].replace(/\b(?:please|now|right now|thanks?)\b.*$/i, "").trim() : "";
  return { topic: topic.length >= 2 ? topic.slice(0, 48) : null };
}

/** What she says in chat. Honest: she doesn't write a new song live, she picks one from her songbook. */
export const CRAFT_SPOKEN = "Crafting a song for you.";
export const CRAFT_REPLY = (topic: string | null) =>
  topic
    ? `Crafting a song for you… I can’t write a brand-new one about “${topic}” yet, so I’m picking one from my songbook 💜`
    : "Crafting a song for you… picking one from my songbook 💜";
