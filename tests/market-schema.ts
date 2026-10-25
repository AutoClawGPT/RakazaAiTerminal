import { ensureSchema, sql } from "../src/lib/db";
(async () => {
  await ensureSchema();
  const q = sql()!;
  const t = (await q`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('curve_trades','index_cursor','mint_stats') ORDER BY 1`) as { table_name: string }[];
  console.log(t.map((r) => r.table_name).join(","));
  if (t.length !== 3) throw new Error("market tables missing");
  await ensureSchema();
  console.log("market schema ok (idempotent)");
})();
