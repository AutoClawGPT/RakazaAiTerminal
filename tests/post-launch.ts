// Reads the on-chain split and the fees ledger for a mint. Read-only.
import { Connection } from "@solana/web3.js";
import { verifySplitOnChain } from "../src/lib/launch/verify-split";
import { buildLedger } from "../src/lib/launch/ledger";
import { platformSplit } from "../src/lib/tools/splits";
(async () => {
  const mint = process.argv[2], fee = process.argv[3];
  const rpc = process.env.HELIUS_DEVNET ?? "https://api.devnet.solana.com";
  const exp = platformSplit(fee, process.env.TREASURY_PUBKEY as string);
  const r = await verifySplitOnChain(new Connection(rpc, "confirmed"), mint, exp.map((s: { address: string; shareBps: number }) => ({ address: s.address, shareBps: s.shareBps })));
  console.log("split", JSON.stringify(r));
  const l = await buildLedger(50);
  if (!l.ok) { console.log("ledger FAIL", l.error); return; }
  const row = l.rows.find((x) => x.mint === mint);
  console.log("ledger totals", JSON.stringify(l.totals), "row", JSON.stringify(row));
})();
