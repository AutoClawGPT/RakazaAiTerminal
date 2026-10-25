// Runs every registered agent tool against the live dev server (REST, owner key from the env file, never printed).
import { readFileSync } from "node:fs";
const BASE = process.env.BASE ?? "http://localhost:3200";
const key = readFileSync(new URL("../.env.local", import.meta.url), "utf8").match(/^API_SERVER_KEY=(.*)$/m)?.[1]?.replace(/^["']|["']$/g, "");
const MINT = "AQBTDs9tw2Qf1Mk2NGC6xyrHPpXDLZyh2xigsynzpump";
const OTHER = "pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn";
const W = "Eux7hEsTK1nhpNFfiSwCsiJuFFpWRJqBNu7ZjdD6wvpW";
const SOL = "So11111111111111111111111111111111111111112";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const inputs = {
  platform_info: {}, project_knowledge: {}, latest_diary: {}, treasury_health: {}, integrations_health: {},
  scan_token: { mint: MINT }, draft_token: { mint: MINT }, vamp_scan: { mint: MINT }, verify_launch: { mint: MINT },
  generate_image: { prompt: "Original coin mascot logo, flat vector, bold colors" },
  scan_lookalikes: { name: "Pump", ticker: "PUMP", mint: MINT },
  preview_fee_split: { launcherWallet: W },
  simulate_launch: { devBuySol: 0.1 },
  compare_addresses: { real: MINT, other: OTHER },
  vanity_shield_score: { charactersCompared: 4 },
  prepare_launch_package: { name: "Audit Bee", ticker: "ABEE", description: "Audit run, dry package only.", launcherWallet: W, devBuySol: 0 },
  wallet_fees: { wallet: W }, wallet_balance: { wallet: W },
  jupiter_quote: { inputMint: SOL, outputMint: USDC, amount: "100000000" },
  jupiter_price: { mints: [SOL, USDC] },
  rugcheck_token: { mint: MINT }, token_authorities: { mint: MINT }, fee_destination: { mint: MINT },
  trust_check: { wallet: W },
};
const list = (await (await fetch(`${BASE}/api/v1/tools`, { headers: { authorization: `Bearer ${key}` } })).json()).tools;
const rows = [];
for (const t of list.filter((x) => !process.env.ONLY || process.env.ONLY.split(",").includes(x.name))) {
  const body = inputs[t.name];
  if (!body) { rows.push([t.name, "FAIL", "no test input defined"]); continue; }
  const t0 = Date.now();
  let res = "", ok = false;
  for (let i = 0; i < 3 && !ok; i++) {
    try {
      const r = await fetch(`${BASE}/api/v1/tools/${t.name}`, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(90000) });
      const j = await r.json().catch(() => ({}));
      ok = r.ok && j.ok !== false;
      if (r.status === 429) { res = "429 (platform rate limit, waiting)"; await new Promise((x) => setTimeout(x, 62000)); continue; }
      res = ok ? "ok" : `${r.status} ${String(j.message ?? j.error ?? "").slice(0, 100)}`;
    } catch (e) { res = String(e.message).slice(0, 80); }
  }
  rows.push([t.name, ok ? "PASS" : "FAIL", `${res} (${Date.now() - t0} ms)`]);
}
for (const r of rows) console.log(r[1].padEnd(5), r[0].padEnd(24), r[2]);
console.log(`\n${rows.filter((r) => r[1] === "PASS").length}/${rows.length} pass`);
