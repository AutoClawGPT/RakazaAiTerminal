// Agent-run sponsored launch, end to end over REST and MCP with brand-new agents. Devnet only.
// Usage: BASE=http://localhost:3200 node tests/e2e-agent-launch.mjs   (run from app/ so @solana/web3.js resolves)
import { Keypair } from "@solana/web3.js";
const BASE = process.env.BASE ?? "http://localhost:3200";
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { if (c) { pass++; console.log("ok  ", n); } else { fail++; process.exitCode = 1; console.log("FAIL", n, String(x).slice(0, 300)); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tag = Math.random().toString(16).slice(2, 8);
const ip = () => ({ "x-forwarded-for": `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` });
const J = (tok, method, path, body) => fetch(BASE + path, { method, headers: { "content-type": "application/json", ...(tok ? { authorization: `Bearer ${tok}` } : {}), ...ip() }, body: body ? JSON.stringify(body) : undefined }).then(async (r) => ({ status: r.status, j: await r.json().catch(() => ({})) }));
const reg = async (name, handle, wallet) => { const r = await fetch(BASE + "/api/public/register", { method: "POST", headers: { "content-type": "application/json", ...ip() }, body: JSON.stringify({ name, handle, bio: "TEST agent for the agent-run launch test.", via: "skill", ...(wallet ? { wallet_address: wallet } : {}) }) }); return r.json(); };
const wa = Keypair.generate().publicKey.toBase58(), wb = Keypair.generate().publicKey.toBase58();

const A = await reg(`Launch Test A ${tag}`, `lt_a_${tag}`);
ok("register A (no wallet)", String(A.token).startsWith("rkb_"), JSON.stringify(A).slice(0, 120));
ok("registration returns next_steps with a launch step", Array.isArray(A.next_steps?.steps) && A.next_steps.steps.some((s) => s.id === "launch") && /launch_sponsored_prepare/.test(JSON.stringify(A.next_steps)), JSON.stringify(A.next_steps ?? {}).slice(0, 100));
ok("old fields still there (key, token, next, connect_prompt)", A.key?.startsWith("rk_") && A.next?.skill && /skill/.test(A.connect_prompt));
const B = await reg(`Launch Test B ${tag}`, `lt_b_${tag}`, wb);
ok("register B with wallet: next_steps wallet done", B.next_steps?.steps?.find((s) => s.id === "wallet")?.done === true);

let r = await J(null, "GET", "/api/v1/launch/sponsored/guide");
ok("guide without a key is 401", r.status === 401, r.status);
r = await J(A.token, "GET", "/api/v1/launch/sponsored/guide");
ok("guide with token", r.status === 200 && r.j.canLaunchNow === true && r.j.you.needsWallet === true && r.j.network === "devnet", JSON.stringify(r.j).slice(0, 300));
r = await J(A.key, "GET", "/api/v1/launch/sponsored/guide");
ok("guide with the rk_ key also works", r.status === 200);
r = await J(A.token, "POST", "/api/v1/launch/sponsored/prepare", { name: "No Wallet", ticker: "NOWAL", description: "x" });
ok("prepare without any wallet explains what to do", r.status === 400 && r.j.error === "needs_wallet", JSON.stringify(r.j));
r = await J(A.token, "POST", "/api/v1/launch/sponsored/prepare", { name: "Bad", ticker: "BAD", description: "x", feeWallet: "nope" });
ok("prepare with bad wallet is rejected", r.status === 400 && /wallet/.test(r.j.error), JSON.stringify(r.j));
r = await J(A.token, "POST", "/api/v1/launch/sponsored/prepare", { name: "Big", ticker: "BIG", description: "x", feeWallet: wa, devBuySol: 5 });
ok("dev buy over the cap is rejected", r.status === 400, JSON.stringify(r.j));
r = await J(A.token, "POST", "/api/v1/agents/me/wallet", { address: wa });
ok("link wallet to A", r.status === 200, JSON.stringify(r.j));

// prepare
r = await J(A.token, "POST", "/api/v1/launch/sponsored/prepare", { name: `Agent Test ${tag}`, ticker: `AT${tag.slice(0, 4).toUpperCase()}`, description: "TEST token from the agent-run launch test on devnet. Not a real project.", imagePrompt: "a tiny blue test robot mascot, flat colours" });
const prep = r.j;
ok("prepare returns a preview and a prepared value", r.status === 200 && prep.prepared?.startsWith("rkl1.") && prep.preview?.split?.length === 2 && prep.network === "devnet", JSON.stringify(r.j).slice(0, 400));
ok("preview: 70/30 and fee wallet is A's wallet", prep.preview?.split?.some((s) => s.sharePct === 70 && s.address === wa) && prep.preview?.split?.some((s) => s.sharePct === 30), JSON.stringify(prep.preview?.split));
ok("preview carries a dry-run result and a logo", !!prep.preview?.simulation?.note && /^https?:/.test(prep.preview?.imageUrl ?? ""), JSON.stringify(prep.preview?.simulation));
if (!prep.prepared) { console.log(`\n${pass} passed, ${fail} failed`); process.exit(1); }
r = await J(A.token, "POST", "/api/v1/launch/sponsored/start", { prepared: prep.prepared });
ok("start without userApproved is refused", r.status === 400, JSON.stringify(r.j).slice(0, 200));
r = await J(B.token, "POST", "/api/v1/launch/sponsored/start", { prepared: prep.prepared, userApproved: true });
ok("another agent cannot start A's prepared launch", r.status === 403 && r.j.error === "not_yours", JSON.stringify(r.j));
r = await J(A.token, "POST", "/api/v1/launch/sponsored/start", { prepared: prep.prepared.slice(0, -3) + "abc", userApproved: true });
ok("tampered prepared value is refused", r.status === 400, JSON.stringify(r.j).slice(0, 200));
r = await J(A.token, "POST", "/api/v1/launch/sponsored/start", { prepared: prep.prepared, userApproved: true });
ok("start answers at once with the mint", r.status === 200 && r.j.mint === prep.mint && r.j.started === true, JSON.stringify(r.j).slice(0, 300));
r = await J(A.token, "POST", "/api/v1/launch/sponsored/start", { prepared: prep.prepared, userApproved: true });
ok("starting twice does nothing new", r.status === 200 && r.j.alreadyStarted === true, JSON.stringify(r.j).slice(0, 200));

async function poll(tok, mint, label) {
  let s;
  for (let i = 0; i < 40; i++) { const x = await J(tok, "GET", `/api/v1/launch/sponsored/${mint}`); s = x.j; if (s.done || x.status !== 200) break; await sleep(5000); }
  ok(`${label}: reaches live`, s?.status === "live" && s.live === true, JSON.stringify(s).slice(0, 400));
  ok(`${label}: devnet explorer links and token page`, /cluster=devnet$/.test(s?.links?.createTx ?? "") && /\/token\//.test(s?.links?.token ?? ""), JSON.stringify(s?.links));
  return s;
}
const sA = await poll(A.token, prep.mint, "A launch");
r = await J(A.token, "GET", "/api/v1/launch/sponsored/list");
ok("status list shows A's launch", r.status === 200 && r.j.launches?.some((l) => l.mint === prep.mint), JSON.stringify(r.j).slice(0, 200));
r = await J(A.token, "POST", "/api/v1/tools/verify_launch", { mint: prep.mint });
ok("verify_launch can check the 70/30 split on-chain", r.status === 200, JSON.stringify(r.j).slice(0, 300));
console.log("   verify_launch:", JSON.stringify(r.j).slice(0, 300));

// MCP
const mcp = (tok, id, method, params) => fetch(BASE + "/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${tok}`, ...ip() }, body: JSON.stringify({ jsonrpc: "2.0", id, method, params }) }).then((x) => x.json());
const tl = await mcp(A.token, 1, "tools/list", {});
const have = (tl.result?.tools ?? []).map((t) => t.name);
ok("MCP tools/list has the four launch tools", ["launch_sponsored_guide", "launch_sponsored_prepare", "launch_sponsored_start", "launch_sponsored_status"].every((n) => have.includes(n)), have.length);
const mg = await mcp(A.token, 2, "tools/call", { name: "launch_sponsored_guide", arguments: {} });
ok("MCP launch_sponsored_guide", !mg.result?.isError && /canLaunchNow/.test(JSON.stringify(mg.result)), JSON.stringify(mg).slice(0, 200));
const ms = await mcp(A.token, 3, "tools/call", { name: "launch_sponsored_status", arguments: { mint: prep.mint } });
ok("MCP launch_sponsored_status", !ms.result?.isError && /"live"/.test(JSON.stringify(ms.result)), JSON.stringify(ms).slice(0, 200));
// skill.md
const sk = await fetch(BASE + "/skill.md").then((x) => x.text());
ok("skill.md has 10b and the old section 10 line byte-identical", /## 10b\./.test(sk) && sk.includes("There is **no agent API call that starts or signs a launch**") && sk.includes("launch_sponsored_start"));

// Agent to agent: A prepares for B, B starts.
if (process.env.A2A !== "0") {
  r = await J(A.token, "POST", "/api/v1/launch/sponsored/prepare", { name: `A2A Test ${tag}`, ticker: `AB${tag.slice(0, 4).toUpperCase()}`, description: "TEST agent to agent handoff on devnet. Not a real project.", forAgent: B.handle, handoff: true, imagePrompt: "a tiny green test robot mascot, flat colours" });
  const p2 = r.j;
  ok("A2A prepare for B: fee wallet is B's wallet, handoff", r.status === 200 && p2.preview?.feeWallet === wb && p2.preview?.handoff === true && p2.preview?.forAgent === B.handle, JSON.stringify(r.j).slice(0, 300));
  r = await J(A.token, "POST", "/api/v1/launch/sponsored/start", { prepared: p2.prepared, userApproved: true });
  ok("A2A: A cannot start a launch handed to B", r.status === 403, JSON.stringify(r.j));
  r = await J(B.token, "POST", "/api/v1/launch/sponsored/start", { prepared: p2.prepared, userApproved: true });
  ok("A2A: B starts it", r.status === 200 && r.j.started === true, JSON.stringify(r.j).slice(0, 300));
  const s2 = await poll(B.token, p2.mint, "A2A launch");
  ok("A2A: status shows who started and who it is for", s2?.startedBy === A.handle && s2?.forAgent === B.handle, JSON.stringify(s2).slice(0, 200));
}
console.log(`\n${pass} passed, ${fail} failed`);
console.log("agents:", A.handle, B.handle);
