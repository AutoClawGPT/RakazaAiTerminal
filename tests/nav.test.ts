import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { NAV_GROUPS, PRIMARY_NAV, getRoute } from "../src/lib/routes";

const labels = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.label));
for (const l of ["Launch", "Self launch", "Agent launch", "Roadmap", "Integrations"]) assert.ok(labels.includes(l), `nav has ${l}`);
assert.equal(NAV_GROUPS.find((g) => g.label === "Roadmap")?.items[1]?.href, "/settings/integrations", "Integrations sits under Roadmap");
// the old pills are all still there, in order
assert.deepEqual(PRIMARY_NAV.map((n) => n.label).slice(0, 3), ["Evaluations", "Model card", "Playground"]);
assert.equal(PRIMARY_NAV.length, 10);
assert.equal(getRoute("/docs/agent-launch").access, "P");
for (const p of ["docs/agent-launch", "self-launch", "roadmap", "settings/integrations"]) assert.ok(existsSync(`src/app/(site)/${p}/page.tsx`), `page for ${p}`);
console.log("nav ok");
