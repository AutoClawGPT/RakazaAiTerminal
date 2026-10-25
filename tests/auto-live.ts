import { vampScan } from "../src/lib/launch/vamp";
import { analyzeAndDraft, flagRisk } from "../src/lib/launch/auto";
(async () => {
  const v = await vampScan(process.argv[2] ?? "AQBTDs9tw2Qf1Mk2NGC6xyrHPpXDLZyh2xigsynzpump");
  if (!v.ok) throw new Error(v.error);
  const t0 = Date.now();
  const d = await analyzeAndDraft(v.result);
  console.log(Date.now() - t0, "ms fromRiver:", d.fromRiver);
  console.log(JSON.stringify(d, null, 1).slice(0, 2500));
  const fr = await flagRisk(d.name, d.ticker);
  console.log("flag risk:", fr.ok ? fr.risk : fr.error);
})();
