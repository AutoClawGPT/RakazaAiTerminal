/** Team grind pool: link-based, no server. The creator makes a sealed-box keypair; contributors seal found keys to the public key. */
import sodium from "libsodium-wrappers";
import bs58 from "bs58";
import { validatePattern, type Pattern } from "./vanity";

export const CODE_PREFIX = "GH1.";

export interface PoolLink {
  v: 1;
  label: string;
  pattern: Pattern;
  pk: string; // base64url sealed-box public key
}
export interface PoolKeypair {
  pk: string;
  sk: string; // base64url, creator only
}
export interface Opened {
  address: string;
  secret: string;
  note: string;
}

const enc = (u: Uint8Array) => btoa(String.fromCharCode(...u)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const dec = (s: string) => {
  const p = s.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(p + "=".repeat((4 - (p.length % 4)) % 4)), (c) => c.charCodeAt(0));
};
const textEnc = (s: string) => new TextEncoder().encode(s);

export async function makePoolKeypair(): Promise<PoolKeypair> {
  await sodium.ready;
  const kp = sodium.crypto_box_keypair();
  return { pk: enc(kp.publicKey), sk: enc(kp.privateKey) };
}

export function encodeLink(l: PoolLink): string {
  return enc(textEnc(JSON.stringify(l)));
}

export function decodeLink(s: string): PoolLink {
  let j: PoolLink;
  try {
    j = JSON.parse(new TextDecoder().decode(dec(s.replace(/^#?(pool=)?/, ""))));
  } catch {
    throw new Error("This pool link is damaged or incomplete.");
  }
  if (!j || j.v !== 1 || typeof j.pk !== "string" || !j.pattern) throw new Error("This is not a Rakaza pool link.");
  const p = { start: String(j.pattern.start ?? ""), end: String(j.pattern.end ?? ""), ignoreCase: !!j.pattern.ignoreCase };
  const check = validatePattern(p);
  if (!check.ok) throw new Error("The pattern in this link is not valid.");
  if (dec(j.pk).length !== 32) throw new Error("The pool key in this link is the wrong size.");
  return { v: 1, label: String(j.label ?? "").slice(0, 60), pattern: p, pk: j.pk };
}

/** Contributor side: seal a found key to the pool public key. Returns a paste-able code. */
export async function sealResult(pk: string, address: string, secret: string, note = ""): Promise<string> {
  await sodium.ready;
  const msg = textEnc(JSON.stringify({ a: address, s: secret, n: note.slice(0, 40) }));
  return CODE_PREFIX + enc(sodium.crypto_box_seal(msg, dec(pk)));
}

/** Creator side: open one code and check the secret really belongs to the address. */
export async function openResult(code: string, kp: PoolKeypair): Promise<Opened> {
  await sodium.ready;
  const c = code.trim();
  if (!c.startsWith(CODE_PREFIX)) throw new Error("A result code starts with GH1.");
  let text: string;
  try {
    text = new TextDecoder().decode(sodium.crypto_box_seal_open(dec(c.slice(CODE_PREFIX.length)), dec(kp.pk), dec(kp.sk)));
  } catch {
    throw new Error("This code was not sealed for your pool key, or it is damaged.");
  }
  const j = JSON.parse(text) as { a: string; s: string; n?: string };
  const raw = bs58.decode(j.s);
  if (raw.length !== 64 || bs58.encode(raw.subarray(32)) !== j.a) throw new Error("The secret in this code does not match its address.");
  const derived = sodium.crypto_sign_seed_keypair(raw.subarray(0, 32)).publicKey;
  if (bs58.encode(derived) !== j.a) throw new Error("The secret in this code does not match its address.");
  return { address: j.a, secret: j.s, note: j.n ?? "" };
}
