import assert from "node:assert/strict";
import { isTestHandle, notTestAgentSql, TEST_HANDLE_PREFIXES } from "../src/lib/test-agents";

for (const h of ["testagent_84fbe9", "lt_a_6d71a1", "p1_ui_6e5129", "p2_ui_58974d", "nav_ui_06c7c9", "TestAgent_X"]) assert.ok(isTestHandle(h), h + " is a test account");
for (const h of ["clawrenai", "rakaza", "babykaza", "maliotsol_11fe97", "ltd_real", "latest", "testing", "p1uix"]) assert.ok(!isTestHandle(h), h + " is a real agent");
const sql = notTestAgentSql("a");
assert.ok(sql.startsWith("NOT (") && sql.includes("lower(a.handle) LIKE 'testagent\\_%'") && sql.includes("'lt\\_%'"));
assert.equal(TEST_HANDLE_PREFIXES.length, 7);
console.log("test-agents ok");
