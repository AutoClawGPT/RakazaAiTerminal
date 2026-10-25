/// <reference lib="webworker" />
import bs58 from "bs58";
import sodium from "libsodium-wrappers";
import { closeness, matcher, type WorkerIn, type WorkerOut } from "./vanity";

const ctx = self as unknown as DedicatedWorkerGlobalScope;
const send = (m: WorkerOut) => ctx.postMessage(m);
let running = false;

async function grind(msg: Extract<WorkerIn, { type: "start" }>) {
  await sodium.ready;
  const test = matcher(msg.pattern);
  const BATCH = 1024; // 1024 seeds x 32 bytes stays under the 65536-byte limit of getRandomValues
  const seeds = new Uint8Array(BATCH * 32);
  const secret = new Uint8Array(64);
  let count = 0;
  let best: { addr: string; score: number } | null = null;
  let last = performance.now();
  let first = true;
  running = true;
  send({ type: "progress", count: 0, best: null }); // tell the UI the grinder is alive right away
  while (running) {
    crypto.getRandomValues(seeds);
    for (let i = 0; i < BATCH; i++) {
      const seed = seeds.subarray(i * 32, i * 32 + 32);
      const pub = sodium.crypto_sign_seed_keypair(seed).publicKey;
      const addr = bs58.encode(pub);
      count++;
      if (test(addr)) {
        secret.set(seed, 0);
        secret.set(pub, 32);
        send({ type: "found", addr, secret: bs58.encode(secret), count });
        running = false;
        return;
      }
      const sc = closeness(msg.pattern, addr);
      if (!best || sc > best.score) best = { addr, score: sc };
    }
    const now = performance.now();
    // first report after ~40 ms so the panel moves at once, then every 200 ms
    if (now - last >= (first ? 40 : 200)) {
      first = false;
      send({ type: "progress", count, best });
      last = now;
      await new Promise((r) => setTimeout(r, 0)); // let a stop message arrive
    }
  }
}

ctx.onmessage = (e: MessageEvent<WorkerIn>) => {
  if (e.data.type === "stop") running = false;
  else if (!running) grind(e.data).catch((err) => send({ type: "error", message: String(err?.message ?? err) }));
};
send({ type: "ready" });
