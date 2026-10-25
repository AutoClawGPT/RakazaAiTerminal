import { buildLedger, clearLedgerCache } from "../src/lib/launch/ledger";
(async () => {
  clearLedgerCache();
  let t = Date.now(); const a = await buildLedger(50); if (!a.ok) throw new Error(a.error); console.log("cold", Date.now() - t, "ms rows", a.rows.length);
  t = Date.now(); await buildLedger(50); console.log("warm", Date.now() - t, "ms");
  for (const r of a.rows.slice(0, 6)) console.log(r.symbol, "await", r.distributableLamports, "sent", r.shares.reduce((a, s) => a + s.sentLamports, 0));
})();
