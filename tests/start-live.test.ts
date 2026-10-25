// Unit test for the shared polling helper: hidden tab = no calls, no overlap, backoff on failure, catch-up on return, stop works.
import assert from "node:assert/strict";
import { startLive } from "../src/lib/live/start-live";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const lis: Record<string, Array<() => void>> = {};
const add = (t: string, f: () => void) => { (lis[t] ??= []).push(f); };
const rm = (t: string, f: () => void) => { lis[t] = (lis[t] ?? []).filter((x) => x !== f); };
const fire = (t: string) => (lis[t] ?? []).slice().forEach((f) => f());
const g = globalThis as Record<string, unknown>;
const doc = { visibilityState: "visible", addEventListener: add, removeEventListener: rm };
g.document = doc; g.window = { addEventListener: add, removeEventListener: rm }; Object.defineProperty(g, "navigator", { value: { onLine: true }, configurable: true });

async function main() {
  // 1. polls while visible, never overlaps
  let calls = 0, running = 0, maxRunning = 0;
  const stop1 = startLive(async () => { calls++; running++; maxRunning = Math.max(maxRunning, running); await sleep(40); running--; }, 30);
  await sleep(400); stop1();
  assert.ok(calls >= 3, `polled ${calls}`); assert.equal(maxRunning, 1, "no overlapping calls");
  const after = calls; await sleep(150); assert.equal(calls, after, "stop() stops polling");
  assert.equal((lis.visibilitychange ?? []).length, 0, "listeners removed");

  // 2. hidden tab: zero calls; returning triggers a catch-up
  doc.visibilityState = "hidden"; let h = 0;
  const stop2 = startLive(() => { h++; }, 30);
  await sleep(300); assert.equal(h, 0, "hidden = no calls");
  doc.visibilityState = "visible"; fire("visibilitychange"); await sleep(60);
  assert.ok(h >= 1, "catch-up when visible again"); stop2();

  // 3. failures slow it down, success resets
  let f = 0; const t0 = Date.now(); const stop3 = startLive(() => { f++; return false; }, 30);
  await sleep(500); stop3();
  assert.ok(f <= 8, `backoff limits failed calls (${f} in ${Date.now() - t0} ms)`); assert.ok(f >= 2);

  // 4. a throwing fn never escapes
  const stop4 = startLive(() => { throw new Error("boom"); }, 20); await sleep(120); stop4();

  // 5. server side (no document) is a no-op
  delete g.document; const stop5 = startLive(() => { throw new Error("must not run"); }, 5); await sleep(30); stop5();
  console.log("start-live tests ok");
}
main().catch((e) => { console.error(e); process.exit(1); });
