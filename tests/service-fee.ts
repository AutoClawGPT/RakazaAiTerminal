/** Offline test (no network, no keys): the self-launch service fee. Quote maths, fallback, clamps, expiry and the check of the signed transaction. */
import assert from "node:assert/strict";
import { ComputeBudgetProgram, Keypair, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction, TransactionInstruction } from "@solana/web3.js";
import { LAMPORTS, MAX_FEE_SOL, MIN_FEE_SOL, QUOTE_TTL_MS, makeQuote, quoteFresh, usdToLamports, verifyServiceFee } from "../src/lib/launch/service-fee-core";

const creator = Keypair.generate().publicKey, treasury = Keypair.generate().publicKey, other = Keypair.generate().publicKey;
const mint = Keypair.generate().publicKey;
const dummy = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"); // a stand-in for the pump program instruction
const create = new TransactionInstruction({ programId: dummy, keys: [{ pubkey: mint, isSigner: true, isWritable: true }, { pubkey: creator, isSigner: true, isWritable: true }], data: Buffer.from([1, 2, 3]) });
const mk = (ixs: TransactionInstruction[], payer = creator) =>
  new VersionedTransaction(new TransactionMessage({ payerKey: payer, recentBlockhash: Keypair.generate().publicKey.toBase58(), instructions: ixs }).compileToV0Message());
const cb = ComputeBudgetProgram.setComputeUnitLimit({ units: 300000 });
const xfer = (to: PublicKey, lamports: number, from = creator) => SystemProgram.transfer({ fromPubkey: from, toPubkey: to, lamports });
const exp = (lamports: number) => ({ creator: creator.toBase58(), treasury: treasury.toBase58(), lamports });

// 1. USD -> SOL
assert.equal(usdToLamports(2, 200), 0.01 * LAMPORTS);
assert.equal(usdToLamports(2, 100), 0.02 * LAMPORTS);
assert.equal(usdToLamports(0, 150), 0);
assert.equal(usdToLamports(2, null), null);
assert.equal(usdToLamports(2, 0), null);
assert.equal(usdToLamports(2, NaN), null);
assert.equal(usdToLamports(-1, 150), null);
// clamps: a broken price feed can never overcharge or undercharge
assert.equal(usdToLamports(2, 1.5), Math.round((2 / 1.5) * LAMPORTS) > MAX_FEE_SOL * LAMPORTS ? MAX_FEE_SOL * LAMPORTS : Math.round((2 / 1.5) * LAMPORTS));
assert.equal(usdToLamports(0.0001, 100000), MIN_FEE_SOL * LAMPORTS);
assert.equal(usdToLamports(2, 1_000_000), null);

// 2. quote: live price, or the fixed SOL fallback (said out loud via source)
const live = makeQuote({ usd: 2, fallbackSol: 0.015, solUsd: 160, now: 1000 });
assert.equal(live.source, "jupiter"); assert.equal(live.lamports, Math.round((2 / 160) * LAMPORTS)); assert.equal(live.at, 1000);
const fb = makeQuote({ usd: 2, fallbackSol: 0.015, solUsd: null, now: 1000 });
assert.equal(fb.source, "fallback"); assert.equal(fb.lamports, 0.015 * LAMPORTS); assert.equal(fb.solUsd, null);
assert.equal(makeQuote({ usd: 2, fallbackSol: 99, solUsd: null }).lamports, MAX_FEE_SOL * LAMPORTS);
assert.equal(makeQuote({ usd: 0, fallbackSol: 0.015, solUsd: null }).lamports, 0);

// 3. expiry
assert.equal(quoteFresh(1000, 1000 + QUOTE_TTL_MS), true);
assert.equal(quoteFresh(1000, 1001 + QUOTE_TTL_MS), false);
assert.equal(quoteFresh(10_000_000, 1000), false, "a quote from the far future is refused too");

// 4. the signed transaction
const fee = 12_500_000;
const good = mk([cb, xfer(treasury, fee), create]);
assert.deepEqual(verifyServiceFee(good, exp(fee)), { ok: true, paid: fee });
assert.deepEqual(verifyServiceFee(mk([cb, xfer(treasury, Math.round(fee * 1.01)), create]), exp(fee)), { ok: true, paid: Math.round(fee * 1.01) }, "within 2%");
const bad = (tx: VersionedTransaction, e = exp(fee)) => { const r = verifyServiceFee(tx, e); assert.equal(r.ok, false); return r.ok ? "" : r.error; };
assert.match(bad(mk([cb, xfer(other, fee), create])), /treasury/);
assert.match(bad(mk([cb, xfer(treasury, fee / 2), create])), /does not match the quote/);
assert.match(bad(mk([cb, xfer(treasury, fee * 2), create])), /does not match the quote/);
assert.match(bad(mk([cb, create])), /missing/);
assert.match(bad(mk([cb, xfer(treasury, fee), xfer(treasury, fee), create])), /more than one/);
assert.match(bad(mk([cb, xfer(treasury, fee, other), create], other)), /launching wallet/);
assert.match(bad(mk([cb, xfer(treasury, fee), SystemProgram.createAccount({ fromPubkey: creator, newAccountPubkey: other, lamports: 1, space: 0, programId: dummy }), create])), /not the service fee/);
assert.match(bad(mk([cb, xfer(treasury, fee), xfer(other, 5_000_000), create])), /treasury/, "a drain to a third address is refused");
// zero fee: no transfer allowed at all (the dev buy transaction uses this)
assert.deepEqual(verifyServiceFee(mk([cb, create]), exp(0)), { ok: true, paid: 0 });
assert.match(bad(mk([cb, xfer(treasury, 1), create]), exp(0)), /no service fee/);
console.log("SERVICE FEE TESTS PASSED");
