// Calls the Agent Launch server actions over HTTP on the dev server (needs DEV_PREVIEW_OWNER_PAGES so the owner guard passes).
// Usage: node tests/e2e-auto.mjs <CA> <feeWallet> [--launch]
import { readFileSync } from "node:fs";
const BASE = process.env.BASE ?? "http://localhost:3200";
const man = JSON.parse(readFileSync(".next/dev/server/app/(dash)/launch/page/server-reference-manifest.json", "utf8")).node;
const id = (name) => Object.entries(man).find(([, v]) => v.exportedName === name)?.[0];
async function act(name, ...args) {
  const r = await fetch(`${BASE}/launch`, { method: "POST", headers: { "Next-Action": id(name), "Content-Type": "text/plain;charset=UTF-8", Accept: "text/x-component" }, body: JSON.stringify(args) });
  const t = await r.text();
  const at = t.lastIndexOf('1:{"ok"');
  if (at < 0) throw new Error(`${name}: HTTP ${r.status} ${t.slice(0, 200)}`);
  const out = JSON.parse(t.slice(at + 2).trim());
  // Large strings come as separate "<n>:T<len>,<text>" chunks referenced as "$<n>". Resolve them.
  const chunks = {};
  for (const m of t.matchAll(/(?:^|\n)([0-9a-f]+):T([0-9a-f]+),/g)) { const len = parseInt(m[2], 16); const start = m.index + m[0].length; chunks[m[1]] = Buffer.from(t.slice(start)).subarray(0, len).toString(); }
  const walk = (o) => { if (typeof o === "string") { const m = /^\$([0-9a-f]+)$/.exec(o); return m && chunks[m[1]] !== undefined ? chunks[m[1]] : o; } if (Array.isArray(o)) return o.map(walk); if (o && typeof o === "object") return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, walk(v)])); return o; };
  return walk(out);
}
const [ca, wallet, flag] = process.argv.slice(2);
const step = (n, ok, note) => console.log(`${ok ? "PASS" : "FAIL"} ${n}${note ? " - " + note : ""}`);
const t = Date.now();
const v = await act("vampScanAction", ca); step("scan", v.ok, v.ok ? `${v.result.flagged} flagged` : v.error); if (!v.ok) process.exit(1);
let d, best;
for (let i = 0; i < 3; i++) {
  const a = await act("autoAnalyzeAction", ca, i ? [best.draft.name, best.draft.ticker] : []); step(`analyze#${i + 1}`, a.ok, a.ok ? `${a.draft.name} $${a.draft.ticker} river=${a.draft.fromRiver}` : a.error); if (!a.ok) process.exit(1);
  const k = await act("autoRiskAction", a.draft.name, a.draft.ticker); step("risk", k.ok, k.ok ? `${k.risk.level} score ${k.risk.score}` : k.error);
  if (!best || k.risk.score < best.risk.score) best = { draft: a.draft, risk: k.risk };
  if (k.ok && k.risk.score < 40) break;
}
d = best.draft;
const im = await act("imageAction", d.imagePrompt); step("image", im.ok, im.ok ? `${im.ms}ms ${im.dataUrl.length}b` : im.error); if (!im.ok) process.exit(1);
const p = await act("autoPinAction", { name: d.name, ticker: d.ticker, description: d.description, imageDataUrl: im.dataUrl, links: {} }); step("pin", p.ok, p.ok ? p.uri : p.error); if (!p.ok) process.exit(1);
const tr = await act("autoTrustAction", wallet); step("trust", tr.ok && !tr.trust.blocked, tr.ok ? `${tr.trust.network} bal ${tr.trust.balanceSol}` : tr.error); if (!tr.ok || tr.trust.blocked) process.exit(1);
const pr = await act("autoPrepareAction", { name: d.name, ticker: d.ticker, description: d.description, uri: p.uri, imageUrl: p.imageUrl, feeWallet: wallet, devBuySol: 0 });
step("prepare", pr.ok && pr.out.simulation.ok, pr.ok ? `${pr.out.simulation.note} mint ${pr.out.plan.mint} split ${pr.out.plan.shareholders.map((s) => s.shareBps).join("/")}` : pr.error);
if (!pr.ok) process.exit(1);
if (flag === "--launch" && pr.out.simulation.ok) {
  const l = await act("launchAction", pr.out.plan, pr.out.ticket, pr.out.sealedMint);
  step("launch", l.ok && l.result.ok, l.ok ? `tx1 ${l.result.tx1} tx2 ${l.result.tx2} split ${l.result.split?.ok}` : l.error);
  if (l.ok) console.log("MINT", pr.out.plan.mint, "creator", pr.out.plan.creator);
}
console.log(`done in ${Math.round((Date.now() - t) / 1000)}s`);
