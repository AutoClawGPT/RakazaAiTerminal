/** Browser vault crypto: AES-256-GCM, key from PBKDF2-SHA256 (310k rounds). Pure WebCrypto, works in browsers and Node 20+. */
export const PBKDF2_ROUNDS = 310_000;
export const MIN_PASSPHRASE = 8;

export interface Sealed {
  v: 1;
  salt: string;
  iv: string;
  data: string;
}
export interface VaultEntry {
  id: string;
  label: string;
  address: string;
  secret: string;
  createdAt: number;
}
export interface VaultDoc {
  entries: VaultEntry[];
}

const subtle = () => globalThis.crypto.subtle;
const b64 = (b: Uint8Array) => {
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
};
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const buf = (u: Uint8Array) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

export function passphraseProblem(p: string): string | null {
  if (p.length < MIN_PASSPHRASE) return `Use at least ${MIN_PASSPHRASE} characters.`;
  return null;
}

async function deriveKey(pass: string, salt: Uint8Array, rounds = PBKDF2_ROUNDS) {
  const base = await subtle().importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveKey"]);
  return subtle().deriveKey({ name: "PBKDF2", salt: buf(salt), iterations: rounds, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export async function seal(doc: VaultDoc, pass: string): Promise<Sealed> {
  const bad = passphraseProblem(pass);
  if (bad) throw new Error(bad);
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pass, salt);
  const ct = await subtle().encrypt({ name: "AES-GCM", iv: buf(iv) }, key, new TextEncoder().encode(JSON.stringify(doc)));
  return { v: 1, salt: b64(salt), iv: b64(iv), data: b64(new Uint8Array(ct)) };
}

export async function open(s: Sealed, pass: string): Promise<VaultDoc> {
  if (!s || s.v !== 1 || !s.salt || !s.iv || !s.data) throw new Error("This is not a Rakaza vault file.");
  try {
    const key = await deriveKey(pass, unb64(s.salt));
    const pt = await subtle().decrypt({ name: "AES-GCM", iv: buf(unb64(s.iv)) }, key, buf(unb64(s.data)));
    const doc = JSON.parse(new TextDecoder().decode(pt)) as VaultDoc;
    if (!Array.isArray(doc.entries)) throw new Error("bad");
    return doc;
  } catch {
    throw new Error("Wrong passphrase, or the vault data is damaged.");
  }
}

export function parseSealed(text: string): Sealed {
  let j: unknown;
  try {
    j = JSON.parse(text);
  } catch {
    throw new Error("That file is not valid JSON.");
  }
  const s = j as Sealed;
  if (!s || s.v !== 1 || typeof s.salt !== "string" || typeof s.iv !== "string" || typeof s.data !== "string") throw new Error("This is not a Rakaza vault file.");
  return s;
}

export function newEntry(label: string, address: string, secret: string): VaultEntry {
  return { id: globalThis.crypto.randomUUID(), label: label.trim() || "Untitled key", address, secret, createdAt: Date.now() };
}
