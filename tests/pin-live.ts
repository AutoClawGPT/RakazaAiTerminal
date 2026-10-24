import assert from "node:assert/strict";
import { pinataStatus, pinMetadata, unpin, metadataDoc } from "../src/lib/launch/pin";
(async () => {
  const st = await pinataStatus(); console.log("status", st); assert.ok(st.ok);
  const d = metadataDoc({ name: "T", symbol: "TT", description: "x", image: "https://ipfs.io/ipfs/x", website: "http://bad", twitter: "https://x.com/a" });
  assert.equal(d.website, undefined); assert.equal(d.twitter, "https://x.com/a");
  const p = await pinMetadata({ name: "Rakaza test", symbol: "RKT", description: "temporary test pin", image: "https://ipfs.io/ipfs/bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku" });
  console.log("pinned", p.uri);
  const r = await fetch(p.uri, { signal: AbortSignal.timeout(30000) }); console.log("gateway read", r.status);
  await unpin(p.cid); console.log("unpinned test pin");
  console.log("PIN LIVE DONE");
})().catch((e) => { console.error("FAIL", e.message); process.exit(1); });
