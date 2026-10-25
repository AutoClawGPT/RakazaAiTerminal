// The Rakaza grinder core. Uses only node:crypto and worker_threads.
import { generateKeyPairSync } from "node:crypto";
import { Worker } from "node:worker_threads";
import { availableParallelism } from "node:os";
import { b58encode } from "./base58.mjs";
import { compile, validatePattern } from "./pattern.mjs";

const OPTS = { publicKeyEncoding: { type: "spki", format: "der" }, privateKeyEncoding: { type: "pkcs8", format: "der" } };

/** One fresh ed25519 key: 32-byte seed, 32-byte public key and the base58 address. */
export function newKey() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519", OPTS);
  const pub = new Uint8Array(publicKey.subarray(publicKey.length - 32));
  const seed = new Uint8Array(privateKey.subarray(privateKey.length - 32));
  return { seed, pub, addr: b58encode(pub) };
}

/** Tries `n` keys. Exported so the worker and tests share one code path. */
export function searchBatch(match, n, make = newKey) {
  const found = [];
  for (let i = 0; i < n; i++) {
    const k = make();
    const idx = match(k.addr);
    if (idx >= 0) found.push({ addr: k.addr, seed: k.seed, pub: k.pub, pattern: idx });
  }
  return { tried: n, found };
}

/** The 64 bytes (seed then public key) that solana-keygen and wallets read, as a JSON array string. */
export function keypairJson(seed, pub) {
  return JSON.stringify(Array.from(new Uint8Array([...seed, ...pub])));
}

/**
 * Grinds until shouldStop() returns true.
 * patterns: [{ start, end, caseSensitive }]. threads: 1 runs in this thread, more starts worker threads.
 * onFound({ addr, seed, pub, pattern }), onProgress({ tried, perSecond }).
 */
export async function grind({ patterns, shouldStop = () => false, onProgress = () => {}, onFound = () => {}, threads = 1 }) {
  if (!Array.isArray(patterns) || patterns.length === 0) throw new Error("grind needs at least one pattern.");
  for (const p of patterns) { const e = validatePattern(p); if (e.length) throw new Error(e.join(" ")); }
  const t0 = Date.now();
  let tried = 0, lastReport = 0;
  const report = () => {
    const now = Date.now();
    if (now - lastReport < 500) return;
    lastReport = now;
    onProgress({ tried, perSecond: Math.round(tried / Math.max(0.001, (now - t0) / 1000)) });
  };
  if (threads <= 1) {
    const match = compile(patterns);
    while (!shouldStop()) {
      const r = searchBatch(match, 2000);
      tried += r.tried;
      for (const f of r.found) onFound(f);
      report();
      await new Promise((res) => setImmediate(res));
    }
    return { tried };
  }
  const workers = [];
  const url = new URL("./worker.mjs", import.meta.url);
  await new Promise((resolve, reject) => {
    let alive = threads;
    for (let i = 0; i < threads; i++) {
      const w = new Worker(url, { workerData: { patterns } });
      workers.push(w);
      w.on("message", (m) => {
        if (m.type === "progress") { tried += m.tried; report(); }
        else if (m.type === "found") onFound({ addr: m.addr, seed: m.seed, pub: m.pub, pattern: m.pattern });
        else if (m.type === "done" && --alive === 0) resolve();
      });
      w.on("error", reject);
    }
    const poll = setInterval(() => { if (shouldStop()) { clearInterval(poll); for (const w of workers) w.postMessage("stop"); } }, 100);
  });
  await Promise.all(workers.map((w) => w.terminate()));
  return { tried };
}

export const defaultThreads = () => Math.max(1, availableParallelism() - 1);
