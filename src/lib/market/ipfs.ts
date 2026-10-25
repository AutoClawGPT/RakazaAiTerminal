import "server-only";

/**
 * ipfs.io now refuses plain (non-browser) requests with HTTP 429, so token metadata and images that were pinned with an
 * ipfs.io address are read through the Pinata gateway instead. Images are served to browsers through our own /api/public/ipfs route.
 */
export const GATEWAY = "https://gateway.pinata.cloud/ipfs";
const CID = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{50,})$/;
export const isCid = (s: string) => CID.test(s);

/** The CID inside an ipfs:// or .../ipfs/<cid> address, or null. */
export function cidOf(u: string): string | null {
  const m = /^ipfs:\/\/([^/?#]+)/.exec(u) ?? /^https?:\/\/[^/]+\/ipfs\/([^/?#]+)/.exec(u);
  return m && isCid(m[1]) ? m[1] : null;
}

/** An address we can fetch from the server. IPFS addresses go through the gateway above; other https addresses stay as they are. */
export function fetchable(u: string): string | null {
  const c = cidOf(u);
  if (c) return `${GATEWAY}/${c}`;
  try { const x = new URL(u); return x.protocol === "https:" ? x.toString() : null; } catch { return null; }
}
