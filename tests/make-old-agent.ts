// Makes an existing agent look like one created before the pilot-stage feature: back-dated, a legacy game-config row (river brain, only the old columns, so pilot_stage / expert_unlocked take their column defaults).
// Usage: tsx tests/make-old-agent.ts <handle>
import { ensureSchema, sql } from "../src/lib/db";
(async () => {
  await ensureSchema();
  const h = process.argv[2];
  const a = (await sql()!.query(`SELECT id FROM agents WHERE handle = $1`, [h])) as { id: string }[];
  if (!a[0]) { console.log("no such agent"); process.exit(1); }
  await sql()!.query(`UPDATE agents SET created_at = now() - interval '30 days' WHERE id = $1`, [a[0].id]);
  await sql()!.query(`INSERT INTO agent_game_config (agent_id, brain_mode, byo_timeout, remind, remind_hour, updated_at) VALUES ($1, 'river', 4000, false, 18, now()) ON CONFLICT (agent_id) DO UPDATE SET brain_mode = 'river', pilot_stage = DEFAULT, expert_unlocked = false`, [a[0].id]);
  const r = (await sql()!.query(`SELECT brain_mode, pilot_stage, expert_unlocked FROM agent_game_config WHERE agent_id = $1`, [a[0].id])) as unknown[];
  console.log("old-style agent", JSON.stringify(r[0]));
})();
