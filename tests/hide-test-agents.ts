// Soft-hides throwaway test agents by handle prefix (never deletes). Usage: tsx tests/hide-test-agents.ts session_ui_ games_e2e_
import { ensureSchema, sql } from "../src/lib/db";
(async () => {
  await ensureSchema();
  for (const p of process.argv.slice(2)) {
    const r = (await sql()!.query(`UPDATE agents SET hidden = true WHERE handle LIKE $1 AND NOT hidden RETURNING id`, [p.replace(/[%_]/g, "\\$&") + "%"])) as unknown[];
    console.log("hidden", p, r.length);
  }
})();
