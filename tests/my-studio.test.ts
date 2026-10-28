// run: npx tsx --conditions react-server tests/my-studio.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ACTIONS } from "../src/lib/api/agent-actions";
import { TOOLS } from "../src/lib/api/tools";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

// the cookie route can run my_studio (same registry as REST and MCP), and it stays read-only: not exposed as a money or write tool
assert.ok(ACTIONS.my_studio, "my_studio action exists");
assert.ok(ACTIONS.my_tokens && ACTIONS.get_me && ACTIONS.game_plays_left, "existing actions untouched");
assert.ok(!TOOLS.some((t) => t.name === "my_studio"), "no new MCP tool was added");

// My studio reads real server data, keeps the device store and its clear button
const my = read("src/components/studio/my-studio.tsx");
for (const s of ["/api/public/me/my_studio", 'data-testid="my-launches"', 'data-testid="my-images"', 'data-testid="my-callouts"', 'data-testid="my-posts"', 'data-testid="my-games"', "Clear this device", "rakaza.me.launches"]) assert.ok(my.includes(s), `my-studio has ${s}`);
assert.ok(!/Saved only in this browser\. No sign-in/.test(my), "stale device-only intro is gone");

// /studio/create no longer shows the stale owner-only sign-in line, and still says owner-only for non-owners
const create = read("src/components/pages/studio-create.tsx");
assert.ok(!/Owner only\. <Link/.test(create), "stale 'Owner only. Sign in' is gone");
assert.ok(/owner-only/i.test(create) && create.includes("studio-owner-hint") && create.includes("generate_image") && create.includes("/studio/me"));

// two Studio tabs on the Studio pages
const tabs = read("src/components/studio/studio-tabs.tsx");
assert.ok(tabs.includes('href="/studio"') && tabs.includes('href="/studio/me"'));
for (const p of ["studio/page.tsx", "studio/create/page.tsx", "studio/me/page.tsx", "studio/explore/page.tsx"]) assert.ok(read(`src/app/(site)/${p}`).includes("StudioTabs"), `${p} has the tabs`);
assert.ok(!/"No sign-in"/.test(read("src/lib/routes-data.json")), "route data no longer claims My studio needs no sign-in");
console.log("my-studio.test ok");
