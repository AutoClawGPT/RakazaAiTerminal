import "server-only";
import { simulationSigner } from "@/lib/launch/sim-signer";
import { PublicKey } from "@solana/web3.js";
import { OnlinePumpSdk, feeSharingConfigPda, creatorVaultPda } from "@pump-fun/pump-sdk";
import { getEnv } from "@/lib/env";
import { connectionFor } from "@/lib/launch/execute";

/**
 * Read-only agent tools modelled on the Solana Agent Kit (RugCheck, token info), the pump.fun coin-fees skill
 * (fee destination) and Said Protocol (trust lookup). Nothing here signs, sends or reveals a key.
 */
const net = () => getEnv().NEXT_PUBLIC_SOLANA_NETWORK;

/** RugCheck's public token summary: risk score and the named risks. Mainnet tokens only. */
export async function rugcheckToken(mint: string) {
  if (net() !== "mainnet-beta") return { ok: false, error: "RugCheck only knows mainnet tokens. This platform is on devnet right now." };
  const r = await fetch(`https://api.rugcheck.xyz/v1/tokens/${mint}/report/summary`, { signal: AbortSignal.timeout(15000), cache: "no-store" });
  if (!r.ok) return { ok: false, error: `RugCheck answered ${r.status}.` };
  const j = (await r.json()) as { score?: number; score_normalised?: number; risks?: { name: string; level: string; description: string }[]; lpLockedPct?: number };
  const risks = (j.risks ?? []).map((x) => ({ name: x.name, level: x.level, description: x.description }));
  return { ok: true, mint, scoreNormalised: j.score_normalised ?? null, lpLockedPct: j.lpLockedPct ?? null, risks, danger: risks.filter((x) => x.level === "danger").length, source: "rugcheck.xyz" };
}

/** Mint and freeze authority, supply, decimals and which token program owns the mint, read from the chain. */
export async function tokenAuthorities(mint: string) {
  const conn = connectionFor(net());
  const info = await conn.getParsedAccountInfo(new PublicKey(mint), "confirmed");
  const v = info.value;
  if (!v) return { ok: false, error: "No account at this address on this network." };
  const data = v.data as { program?: string; parsed?: { type?: string; info?: { mintAuthority: string | null; freezeAuthority: string | null; supply: string; decimals: number; extensions?: { extension: string }[] } } };
  if (data.parsed?.type !== "mint" || !data.parsed.info) return { ok: false, error: "This address is not a token mint." };
  const i = data.parsed.info;
  const warnings: string[] = [];
  if (i.mintAuthority) warnings.push("The mint authority is still set, so more tokens can be created.");
  if (i.freezeAuthority) warnings.push("A freeze authority is set, so holder accounts can be frozen.");
  return { ok: true, network: net(), mint, tokenProgram: v.owner.toBase58(), decimals: i.decimals, supply: i.supply, mintAuthority: i.mintAuthority, freezeAuthority: i.freezeAuthority, extensions: (i.extensions ?? []).map((e) => e.extension), warnings, note: "Pump.fun tokens normally have both authorities removed." };
}

/** Where a pump.fun coin's creator fees go: traders (cashback), shareholders (sharing config) or the creator. */
export async function feeDestination(mint: string) {
  const conn = connectionFor(net());
  const m = new PublicKey(mint);
  const sdk = new OnlinePumpSdk(conn);
  let curve;
  try { curve = await sdk.fetchBondingCurve(m); } catch { return { ok: false, error: "No pump.fun bonding curve for this mint on this network." }; }
  const base = { ok: true as const, network: net(), mint, graduated: curve.complete, creator: curve.creator.toBase58() };
  if (curve.isCashbackCoin) return { ...base, destination: "cashback", detail: "Creator fees go back to traders as cashback. There is no creator vault, so a fee split cannot apply." };
  const cfg = await conn.getAccountInfo(feeSharingConfigPda(m), "confirmed");
  if (cfg) {
    let fees: { distributableLamports: number; minimumRequiredLamports: number; canDistribute: boolean } | undefined;
    try { const r = await sdk.getMinimumDistributableFee(m, simulationSigner()); fees = { distributableLamports: Number(r.distributableFees.toString()), minimumRequiredLamports: Number(r.minimumRequired.toString()), canDistribute: r.canDistribute }; } catch { /* leave undefined */ }
    return { ...base, destination: "sharing_config", detail: "Creator fees go to the shareholders on the coin's sharing config. Anyone can trigger the payout.", fees };
  }
  const vault = await conn.getBalance(creatorVaultPda(curve.creator), "confirmed");
  return { ...base, destination: "creator", detail: "Creator fees go straight to the creator's vault.", creatorVaultLamports: vault };
}

/** Said Protocol's public trust tier for a wallet, plus on-chain sanity facts about it. */
export async function trustCheck(wallet: string) {
  const conn = connectionFor(net());
  const pk = new PublicKey(wallet);
  const [acct, bal] = await Promise.all([conn.getAccountInfo(pk, "confirmed"), conn.getBalance(pk, "confirmed")]);
  const notes: string[] = [];
  if (!PublicKey.isOnCurve(pk.toBytes())) notes.push("This address is not on the ed25519 curve, so it is a program-derived address and has no private key. Fees sent here may be stuck.");
  if (acct?.executable) notes.push("This address is a program, not a wallet.");
  if (acct && acct.owner.toBase58() !== "11111111111111111111111111111111") notes.push(`This account is owned by ${acct.owner.toBase58()}, not the system program, so it is not a normal wallet.`);
  if (bal === 0) notes.push("This wallet has never held SOL on this network. That is fine for receiving fees but worth confirming it is the right address.");
  type Said = { tier?: string; trustTier?: string; registered?: boolean };
  let said = null as Said | null;
  try {
    const r = await fetch(`https://api.saidprotocol.com/api/trust/${wallet}`, { signal: AbortSignal.timeout(10000), cache: "no-store" });
    if (r.ok) said = (await r.json()) as Said;
  } catch { /* Said is optional */ }
  return { ok: true, network: net(), wallet, normalWallet: notes.filter((n) => !n.startsWith("This wallet has never")).length === 0, balanceSol: bal / 1e9, notes, said: said === null ? null : { registered: !!(said as Said).registered, tier: (said as Said).tier ?? (said as Said).trustTier ?? "none" }, source: "saidprotocol.com" };
}
