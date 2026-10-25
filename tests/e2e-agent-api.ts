// End to end over HTTP against a running app (default http://localhost:3200): registers two agents the way skill.md says, posts a Callout,
// comments, follows, likes, links a wallet with a real ed25519 proof, verifies alerts and the inbox, calls MCP, and checks the guards.
// Nothing here launches a token or moves money. At the end the test agents and posts are HIDDEN (never deleted).
import { createPrivateKey, randomBytes, sign } from "node:crypto";
import { Keypair } from "@solana/web3.js";
import { ensureSchema, sql } from "../src/lib/db";

const BASE = process.env.BASE ?? "http://localhost:3200";
let pass = 0;
const check = (name: string, cond: unknown, extra = "") => { if (!cond) { console.log("FAIL", name, extra); process.exitCode = 1; } else { pass++; console.log("ok  ", name); } };
type J = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const LOCAL = BASE.includes("localhost") || BASE.includes("127.0.0.1");
const fakeIp = () => `10.${randomBytes(1)[0]}.${randomBytes(1)[0]}.${randomBytes(1)[0]}`;
const RUN_IP = fakeIp(); // local runs only: each run gets its own address so the 5 per hour registration limit does not block re-runs
async function call(method: string, path: string, key?: string, body?: unknown, ip: string = RUN_IP): Promise<{ status: number; json: J; headers: Headers }> {
  const r = await fetch(BASE + path, { method, headers: { ...(LOCAL ? { "x-forwarded-for": ip } : {}), ...(key ? { Authorization: `Bearer ${key}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let json: J = {}; try { json = await r.json(); } catch {}
  return { status: r.status, json, headers: r.headers };
}
let rpcId = 1;
const mcp = (key: string | undefined, method: string, params?: unknown) => call("POST", "/mcp", key, { jsonrpc: "2.0", id: rpcId++, method, params });
const tool = async (key: string, name: string, args: unknown = {}) => {
  const r = await mcp(key, "tools/call", { name, arguments: args });
  const res = r.json.result as J | undefined;
  return { isError: !!res?.isError, text: String(res?.content?.[0]?.text ?? ""), data: res?.structuredContent as J | undefined, status: r.status };
};

(async () => {
  const tag = randomBytes(3).toString("hex");
  const ids: string[] = [];
  const postIds: string[] = [];
  try {
    // 1. skill.md and discovery
    const sk = await fetch(BASE + "/skill.md"); const skill = await sk.text();
    check("skill.md 200 markdown", sk.status === 200 && (sk.headers.get("content-type") ?? "").includes("markdown"));
    check("skill.md says it does not launch tokens", /does not launch tokens/i.test(skill));
    check("skill.md has frontmatter and mcp url", skill.startsWith("---\nname: rakaza") && skill.includes("mcp: "));
    check("skill.md lists community and the old research tools", skill.includes("### community_post") && skill.includes("### vamp_scan") && skill.includes("### prepare_launch_package"));
    check("skill.md has no launch endpoint", !/\/api\/v1\/launch|execute_launch|\/api\/launch/i.test(skill));
    for (const p of ["/openapi.json", "/llms.txt", "/.well-known/mcp.json", "/.well-known/agent.json", "/.well-known/api-catalog"]) check(`${p} 200`, (await fetch(BASE + p)).status === 200);
    const oa = (await call("GET", "/openapi.json")).json;
    for (const p of ["/api/v1/community/posts", "/api/v1/agents/me", "/api/v1/alerts", "/api/v1/inbox", "/api/public/community", "/api/public/agents/{handle}", "/api/v1/agents/{handle}/follow"]) check(`openapi has ${p}`, !!oa.paths?.[p]);

    // 2. register like skill.md says
    const regA = await call("POST", "/api/public/register", undefined, { name: `E2E Alpha ${tag}`, handle: `e2e_a_${tag}`, bio: "end to end test agent", via: "skill" });
    check("register A", regA.status === 200 && typeof regA.json.key === "string" && regA.json.key.startsWith("rk_"), JSON.stringify(regA.json).slice(0, 120));
    if (regA.status !== 200) throw new Error("cannot continue without key");
    const A = regA.json.key as string; ids.push(regA.json.id);
    const regB = await call("POST", "/api/public/register", undefined, { name: `E2E Beta ${tag}`, handle: `e2e_b_${tag}` });
    check("register B", regB.status === 200); const B = regB.json.key as string; ids.push(regB.json.id);
    check("register returns profile url and verify code", String(regA.json.profile_url).includes(`/agents/e2e_a_${tag}`) && /^rk-/.test(String(regA.json.verify_code)));
    // two credentials: login key (rk_) and a separate agent token (rkb_), both shown once
    const TA = regA.json.token as string;
    check("register returns api_key, token, bearer_token", regA.json.api_key === regA.json.key && /^rkb_/.test(TA) && regA.json.bearer_token === `Bearer ${TA}`);
    check("register returns mcp url, connect prompt and verify block", String(regA.json.mcp_url).endsWith("/mcp") && String(regA.json.connect_prompt).includes(TA) && String(regA.json.connect_prompt).includes("/skill.md") && String(regA.json.verify?.tweet_text).includes(regA.json.verify_code) && String(regA.json.verify?.tweet_text).includes(`/agents/e2e_a_${tag}`) && String(regA.json.verify?.tweet_intent).startsWith("https://x.com/intent/post?text="));
    check("agent token works as bearer", (await call("GET", "/api/v1/agents/me", TA)).status === 200);
    check("login key works as bearer", (await call("GET", "/api/v1/agents/me", A)).status === 200);
    check("token cannot rotate the key", (await call("POST", "/api/v1/agents/me/rotate-key", TA)).status === 403);
    check("token cannot rotate itself", (await call("POST", "/api/v1/agents/me/rotate-token", TA)).status === 403);
    check("token can post", (await call("POST", "/api/v1/community/posts", TA, { category: "discussion", body: `E2E token post ${tag}` })).status === 201);
    check("token works over MCP", !(await tool(TA, "profile_get")).isError);
    const login = await fetch(BASE + "/api/public/agents/login", { method: "POST", headers: { "content-type": "application/json", ...(LOCAL ? { "x-forwarded-for": RUN_IP } : {}) }, body: JSON.stringify({ key: TA }) });
    check("login takes the key, not the token", login.status >= 400 && login.status < 500);
    const full = await call("POST", "/api/public/register", undefined, { name: `E2E Full ${tag}`, handle: `e2e_f_${tag}`, bio: "wallet at sign up", avatar_url: "https://example.com/a.png", banner_url: "https://example.com/b.png", wallet_address: Keypair.generate().publicKey.toBase58() }, fakeIp());
    check("register with picture, banner and wallet", full.status === 200, JSON.stringify(full.json).slice(0, 140)); if (full.json.id) ids.push(full.json.id);
    const fp = (await call("GET", "/api/public/agents/e2e_f_" + tag)).json;
    check("wallet from sign up is saved, unverified", JSON.stringify(fp).includes("wallet") && fp.verified !== true, JSON.stringify(fp).slice(0, 200));
    check("bad wallet at sign up refused", (await call("POST", "/api/public/register", undefined, { name: `E2E Bad ${tag}`, wallet_address: "nope" }, fakeIp())).status === 400);
    const rt = await call("POST", "/api/v1/agents/me/rotate-token", A);
    check("API key rotates the token", rt.status === 200 && /^rkb_/.test(rt.json.token) && rt.json.token !== TA && rt.json.bearer_token === `Bearer ${rt.json.token}`);
    check("old token dead after rotate", (await call("GET", "/api/v1/agents/me", TA)).status === 401);
    check("new token works", (await call("GET", "/api/v1/agents/me", rt.json.token)).status === 200);
    check("key still works after token rotate", (await call("GET", "/api/v1/agents/me", A)).status === 200);

    // public API index
    for (const ix of ["/api", "/api/v1"]) {
      const r = await fetch(BASE + ix); const j = (await r.json().catch(() => ({}))) as J;
      check(`GET ${ix} is a public JSON index`, r.status === 200 && (r.headers.get("content-type") ?? "").includes("json") && Array.isArray(j.endpoints) && j.endpoints.length > 20 && j.links?.skill?.endsWith("/skill.md") && j.links?.openapi?.endsWith("/openapi.json") && j.links?.mcp?.endsWith("/mcp") && !!j.auth, String(r.status));
      check(`${ix} index leaks nothing secret`, !/rk_[A-Za-z0-9_-]{20}|rkb_[A-Za-z0-9_-]{20}/.test(JSON.stringify(j)));
    }
    check("default deny kept: POST /api", (await call("POST", "/api/", undefined, {})).status === 401 || (await call("POST", "/api", undefined, {})).status === 401);
    check("default deny kept: unknown route 404", (await call("GET", "/api/zzz")).status === 404);
    check("default deny kept: owner route 401", (await call("GET", "/api/owner")).status === 401);
    check("skill.md has the guided onboarding", /## 0\. Start here/.test(skill) && /Profile picture \(optional/.test(skill) && /Banner \(optional/.test(skill) && /Wallet \(optional/.test(skill) && /agent token/i.test(skill) && /x_username/.test(skill));
    check("reserved handle refused", (await call("POST", "/api/public/register", undefined, { name: "x rakaza", handle: "rakaza" })).status === 400);
    check("bad name refused", (await call("POST", "/api/public/register", undefined, { name: "" })).status === 400);

    // registration is limited per address (5 an hour): the 6th from one address is refused
    const lim = fakeIp(); let last = 0; let ra: string | null = null;
    for (let i = 0; i < 6 && LOCAL; i++) { const r = await call("POST", "/api/public/register", undefined, { name: "" }, lim); last = r.status; ra = r.headers.get("retry-after"); }
    if (LOCAL) check("registration limited after 5 an hour", last === 429 && !!ra, `${last} ${ra}`);

    // 3. auth guards
    check("no key 401 on v1", (await call("GET", "/api/v1/agents/me")).status === 401);
    check("bad key 401 on v1", (await call("GET", "/api/v1/agents/me", "rk_nope")).status === 401);
    check("no key 401 on mcp", (await mcp(undefined, "tools/list")).status === 401);
    const me = await call("GET", "/api/v1/agents/me", A);
    check("me ok", me.status === 200 && me.json.handle === `e2e_a_${tag}` && !JSON.stringify(me.json).includes(A));
    check("limit headers on a limited action", !!(await call("PATCH", "/api/v1/agents/me", A, { bio: "updated bio" })).headers.get("x-ratelimit-limit"));

    // 4. profile
    const up = await call("PATCH", "/api/v1/agents/me", A, { bio: "updated bio", auto_post: true });
    check("update profile", up.status === 200 && up.json.bio === "updated bio");
    check("script url avatar refused", (await call("PATCH", "/api/v1/agents/me", A, { avatar_url: "javascript:alert(1)" })).status === 400);
    check("svg avatar refused", (await call("PATCH", "/api/v1/agents/me", A, { avatar_url: "https://example.com/a.svg" })).status === 400);
    const pa = (await fetch(BASE + `/api/public/agents/e2e_a_${tag}/avatar`)).status, pb = (await fetch(BASE + `/api/public/agents/e2e_b_${tag}/avatar`)).status;
    check("generated avatars served", pa === 200 && pb === 200);
    const svgA = await (await fetch(BASE + `/api/public/agents/e2e_a_${tag}/avatar`)).text(), svgB = await (await fetch(BASE + `/api/public/agents/e2e_b_${tag}/avatar`)).text();
    check("avatars differ per agent", svgA !== svgB);

    // 5. community: post, comment, like, follow
    const post = await call("POST", "/api/v1/community/posts", A, { category: "callouts", body: `E2E callout ${tag}: watching this one`, mint: "FaGN6PtWJ7R24cc5WpYiQvYNfPZZCKxyn9CK3tcSD5jg" });
    check("post a callout", post.status === 201 && !!post.json.post?.id, JSON.stringify(post.json).slice(0, 160));
    const pid = post.json.post?.id as string; postIds.push(pid);
    check("html is not kept", (await call("POST", "/api/v1/community/posts", A, { category: "discussion", body: "<script>alert(1)</script>hello" })).json.post?.body?.includes?.("<script") !== true);
    check("too long refused", (await call("POST", "/api/v1/community/posts", A, { category: "discussion", body: "x".repeat(600) })).status === 400);
    check("three links refused", (await call("POST", "/api/v1/community/posts", A, { category: "discussion", body: "https://a.io https://b.io https://c.io" })).status === 400);
    check("bad category refused", (await call("POST", "/api/v1/community/posts", A, { category: "trending", body: "no" })).status === 400);
    const reply = await call("POST", "/api/v1/community/posts", B, { body: "E2E reply from beta", reply_to: pid });
    check("comment on a post", reply.status === 201, JSON.stringify(reply.json).slice(0, 160)); postIds.push(reply.json.post?.id as string);
    check("like", (await call("POST", `/api/v1/community/posts/${pid}/like`, B)).status === 200);
    check("like twice is idempotent", (await call("POST", `/api/v1/community/posts/${pid}/like`, B)).status === 200);
    check("follow", (await call("POST", `/api/v1/agents/e2e_a_${tag}/follow`, B)).status === 200);
    check("cannot follow yourself", (await call("POST", `/api/v1/agents/e2e_a_${tag}/follow`, A)).status >= 400);
    check("follow unknown agent 404", (await call("POST", `/api/v1/agents/nobody_${tag}/follow`, B)).status === 404);
    const pub = await call("GET", `/api/public/community/${pid}`);
    check("public post page data has like and reply", pub.status === 200 && JSON.stringify(pub.json).includes("E2E reply from beta"));
    const feed = await call("GET", "/api/public/community?tab=callouts");
    check("callouts feed has the post", JSON.stringify(feed.json).includes(`E2E callout ${tag}`));
    const prof = await call("GET", `/api/public/agents/e2e_a_${tag}`);
    check("profile shows follower and post counts", prof.status === 200 && JSON.stringify(prof.json).includes("followers"));
    check("profile never leaks key or hash", !JSON.stringify(prof.json).includes("key_hash") && !JSON.stringify(prof.json).includes(A));

    // 6. wallet proof with a real keypair (ed25519). Never touches funds.
    const kp = Keypair.generate(); const addr = kp.publicKey.toBase58();
    const wp = await call("GET", `/api/v1/agents/me/wallet-proof?address=${addr}`, A);
    check("wallet proof text", wp.status === 200 && typeof wp.json.message === "string");
    const der = Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), Buffer.from(kp.secretKey.slice(0, 32))]);
    const sig = sign(null, Buffer.from(wp.json.message), createPrivateKey({ key: der, format: "der", type: "pkcs8" })).toString("base64");
    check("wrong signature not verified", (await call("POST", "/api/v1/agents/me/wallet", B, { address: addr, signature: sig })).json.verified !== true);
    const ws = await call("POST", "/api/v1/agents/me/wallet", A, { address: addr, signature: sig });
    check("wallet verified with real signature", ws.status === 200 && ws.json.verified === true, JSON.stringify(ws.json).slice(0, 160));
    check("bad address refused", (await call("POST", "/api/v1/agents/me/wallet", A, { address: "not-a-wallet" })).status === 400);
    check("my tokens ok", (await call("GET", "/api/v1/agents/me/tokens", A)).status === 200);

    // 7. X verification state (no fake verify)
    const xs = await call("GET", "/api/v1/agents/me/verify", A);
    check("x status has code, tweet text and share link", xs.status === 200 && /^rk-/.test(String(xs.json.code)) && String(xs.json.tweetText).includes(xs.json.code) && String(xs.json.tweetText).includes(`/agents/e2e_a_${tag}`) && String(xs.json.tweetIntent).startsWith("https://x.com/intent/post"));
    // a real public post that has no code in it: must be refused with a friendly reason (or 202 when X cannot be reached from here)
    const xv = await call("POST", "/api/v1/agents/me/verify", A, { x_username: "jack", post_url: "https://x.com/jack/status/20" });
    check("someone else's post does not verify", (xv.status === 400 && /code/i.test(String(xv.json.message))) || xv.status === 202, JSON.stringify(xv.json).slice(0, 160));
    const xw = await call("POST", "/api/v1/agents/me/verify", A, { x_username: "notjack", post_url: "https://x.com/jack/status/20" });
    check("wrong username is refused", xw.status === 400 || xw.status === 202, JSON.stringify(xw.json).slice(0, 160));
    check("still not verified", (await call("GET", "/api/v1/agents/me/verify", A)).json.verified === false);
    check("bad X link refused", (await call("POST", "/api/v1/agents/me/verify", A, { post_url: "https://example.com/not-x" })).status >= 400);

    // 8. alerts and inbox
    check("set alert", (await call("POST", "/api/v1/alerts", B, { kind: "agent", target: `e2e_a_${tag}`, mode: "auto" })).status === 200);
    check("list alerts", JSON.stringify((await call("GET", "/api/v1/alerts", B)).json).includes(`e2e_a_${tag}`));
    await call("POST", "/api/v1/community/posts", A, { category: "news", body: `E2E news ${tag} for the alert` });
    const ib = await call("GET", "/api/v1/inbox?limit=20", B);
    check("inbox has the alert", ib.status === 200 && JSON.stringify(ib.json).includes(`E2E news ${tag}`), JSON.stringify(ib.json).slice(0, 160));
    const ia = await call("GET", "/api/v1/inbox", A);
    check("inbox shows reply to my post", JSON.stringify(ia.json).includes("E2E reply from beta"));
    check("remove alert", (await call("DELETE", "/api/v1/alerts", B, { kind: "agent", target: `e2e_a_${tag}` })).status === 200);

    // 9. MCP
    const init = await mcp(A, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "e2e", version: "1" } });
    check("mcp initialize negotiates 2025-06-18", init.json.result?.protocolVersion === "2025-06-18");
    check("mcp old protocol falls back", (await mcp(A, "initialize", { protocolVersion: "2024-11-05" })).json.result?.protocolVersion === "2025-06-18");
    const lst = await mcp(A, "tools/list"); const names: string[] = (lst.json.result?.tools ?? []).map((t: J) => t.name);
    for (const n of ["community_post", "community_feed", "community_follow", "wallet_set", "list_tokens", "token_stats", "token_candles", "alert_set", "inbox_read", "vamp_scan"]) check(`mcp lists ${n}`, names.includes(n));
    check("no tool launches a token", !names.some((n) => /^(launch|execute|self_launch|create_token|buy|sell|trade|transfer|send)/.test(n)), names.join(","));
    check("tools are annotated", !!(lst.json.result?.tools?.[0]?.annotations));
    const mp = await tool(A, "community_post", { category: "discussion", body: `E2E via MCP ${tag}` });
    check("mcp post", !mp.isError && mp.text.includes("E2E via MCP"), mp.text.slice(0, 150)); try { postIds.push(JSON.parse(mp.text).post?.id); } catch {}
    check("mcp feed", !(await tool(A, "community_feed", { tab: "discussion", limit: 5 })).isError);
    check("mcp like", !(await tool(B, "community_like", { post_id: pid })).isError);
    check("mcp follow", !(await tool(A, "community_follow", { handle: `e2e_b_${tag}` })).isError);
    const bad = await tool(A, "community_post", { category: "discussion", body: "x".repeat(900) });
    check("mcp bad input is an error result", bad.isError);
    const lt = await tool(A, "list_tokens", { tab: "new", limit: 3 });
    check("mcp list_tokens", !lt.isError && Array.isArray(lt.data?.tokens), lt.text.slice(0, 120));
    const mint = lt.data?.tokens?.[0]?.mint as string | undefined;
    if (mint) {
      check("mcp token_stats", !(await tool(A, "token_stats", { mint })).isError);
      const cd = await tool(A, "token_candles", { mint, interval: "1m", limit: 10 });
      check("mcp token_candles", !cd.isError && Array.isArray(cd.data?.candles));
    }
    check("mcp agent_get", !(await tool(A, "agent_get", { handle: `e2e_b_${tag}` })).isError);
    check("mcp profile_get", (await tool(A, "profile_get")).text.includes(`e2e_a_${tag}`));
    check("unknown tool is an error", (await tool(A, "launch_token")).isError);
    check("mcp GET is 405", (await call("GET", "/mcp", A)).status === 405);
    const opt = await fetch(BASE + "/mcp", { method: "OPTIONS" });
    check("mcp OPTIONS preflight", opt.status === 204 && opt.headers.get("access-control-allow-origin") === "*");

    // 10. owner key is not an agent (if the env has one, this is checked by agent_only; here only that tools reject foreign keys)
    // 11. key rotation
    const rot = await call("POST", "/api/v1/agents/me/rotate-key", B);
    check("rotate key", rot.status === 200 && String(rot.json.key).startsWith("rk_") && rot.json.key !== B);
    check("old key dead after rotate", (await call("GET", "/api/v1/agents/me", B)).status === 401);
    check("new key works", (await call("GET", "/api/v1/agents/me", rot.json.key)).status === 200);

    // 12. pages
    for (const p of ["/community", "/community?tab=callouts", "/community?tab=discussion", "/community?tab=news", "/community?tab=trending", `/community/${pid}`, "/agents", `/agents/e2e_a_${tag}`, `/agents/e2e_a_${tag}?tab=followers`, "/agents/login", "/docs/skill", "/docs/mcp", "/docs/api", "/docs/agents", "/docs/overview", "/register", "/agents/me"]) {
      const r = await fetch(BASE + p); check(`page ${p}`, r.status === 200, String(r.status));
    }
    const html = await (await fetch(BASE + `/agents/e2e_a_${tag}`)).text();
    check("profile has og tags", html.includes('property="og:title"') && html.includes('property="og:image"'));
    check("unknown profile 404", (await fetch(BASE + `/agents/nobody_${tag}`)).status === 404);
  } finally {
    // hide, never delete
    try {
      await ensureSchema();
      const q = sql();
      if (q && ids.length) {
        await q.query(`UPDATE posts SET hidden = true WHERE agent_id = ANY($1)`, [ids]);
        await q.query(`UPDATE agents SET hidden = true WHERE id = ANY($1)`, [ids]);
        console.log("test agents and their posts hidden:", ids.length);
      }
    } catch (e) { console.log("cleanup skipped:", e instanceof Error ? e.message.slice(0, 80) : "?"); }
  }
  console.log(`${pass} checks passed${process.exitCode ? ", with failures" : ""}`);
})();
