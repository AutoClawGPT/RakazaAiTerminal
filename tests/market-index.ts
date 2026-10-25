import { listPublicMints } from "../src/lib/market/counts";
import { readCurves } from "../src/lib/market/curve";
import { indexMint, refreshStats } from "../src/lib/market/indexer";
import { sql } from "../src/lib/db";
(async () => {
  const mints = (await listPublicMints(30)).map((m) => m.mint);
  console.log("public mints", mints.length);
  const c = await readCurves("devnet", mints);
  for (const m of mints) console.log(m.slice(0, 6), JSON.stringify(c.get(m)));
  for (const m of mints.slice(0, 6)) { const r = await indexMint("devnet", m, { maxSigs: 60 }); console.log(m.slice(0, 6), JSON.stringify(r)); }
  await refreshStats("devnet", mints.slice(0, 6));
  console.log(JSON.stringify(await sql()!`SELECT mint, side, sol_amount, token_amount, price_sol FROM curve_trades ORDER BY ts DESC LIMIT 4`));
  console.log(JSON.stringify(await sql()!`SELECT mint, progress_pct, complete, trades24h, volume24h_sol FROM mint_stats LIMIT 8`));
})();
