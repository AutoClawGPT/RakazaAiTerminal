import { vampScan } from "../src/lib/launch/vamp";
(async () => {
  const mint = process.argv[2] ?? "AQBTDs9tw2Qf1Mk2NGC6xyrHPpXDLZyh2xigsynzpump";
  const r = await vampScan(mint);
  if (!r.ok) throw new Error(r.error);
  console.log(r.result.token.name, r.result.token.symbol, "| flagged", r.result.flagged, "checked", r.result.checked, "| shield", r.result.shield);
  for (const x of r.result.rows.slice(0, 6)) console.log(" -", x.text, x.chart);
})();
