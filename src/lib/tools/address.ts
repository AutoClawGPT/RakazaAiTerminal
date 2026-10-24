import bs58 from "bs58";

/** True when `s` is a base58 string that decodes to exactly 32 bytes (a Solana public key). */
export function isSolanaAddress(s: string): boolean {
  const v = s.trim();
  if (v.length < 32 || v.length > 44) return false;
  try {
    return bs58.decode(v).length === 32;
  } catch {
    return false;
  }
}
