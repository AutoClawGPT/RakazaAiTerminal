import "server-only";
import { z } from "zod";
import { fetchToken } from "@/lib/launch/token-fetch";
import { optimizeToken } from "@/lib/launch/optimize";
import { radarScan } from "@/lib/launch/radar";
import { vampScan } from "@/lib/launch/vamp";
import { integrationsHealth } from "@/lib/health";
import { currentDiary } from "@/lib/diary";
import { generateImage } from "@/lib/pollinations";
import { platformSplit, treasuryClash, validateSplit } from "@/lib/tools/splits";
import { simulate } from "@/lib/tools/curve";
import { compareAddresses, shieldScore } from "@/lib/tools/shield";
import { isSolanaAddress } from "@/lib/tools/address";
import { buildMetadata, emptyKit } from "@/lib/tools/kit";
import { publicEnv } from "@/lib/public-env";
import { getEnv } from "@/lib/env";
import { AGENT_KNOWLEDGE } from "@/lib/brain/knowledge";
import { feeDestination, rugcheckToken, tokenAuthorities, trustCheck } from "./agent-kit-tools";
import { jupiterPrice, jupiterQuote, treasuryHealth, verifyLaunch, walletBalance, walletFees } from "./chain-tools";
import type { Caller } from "@/lib/auth/agent-keys";
import { COMMUNITY_TOOLS } from "./community-tools";
import { LAUNCH_TOOLS } from "./launch-tools";
import { ToolFail } from "./tool-types";

const addr = z.string().refine(isSolanaAddress, "Not a valid Solana address");

export interface Tool {
  name: string;
  title: string;
  description: string;
  schema: z.ZodObject<z.ZodRawShape>;
  /** Slow or costly tools get a tighter per-caller rate limit. */
  heavy?: boolean;
  run: (input: never, caller: Caller) => Promise<unknown>;
}

function tool<S extends z.ZodRawShape>(t: { name: string; title: string; description: string; shape: S; heavy?: boolean; run: (i: z.infer<z.ZodObject<S>>, c: Caller) => Promise<unknown> }): Tool {
  return { name: t.name, title: t.title, description: t.description, schema: z.object(t.shape), heavy: t.heavy, run: t.run as Tool["run"] };
}

const BASE_TOOLS: Tool[] = [
  tool({
    name: "platform_info",
    title: "Platform info",
    description: "What this platform is, which network it is on, and which actions are switched on.",
    shape: {},
    run: async () => ({
      name: "Rakaza",
      network: publicEnv.network,
      treasury: publicEnv.treasuryPubkey ?? null,
      feeSplit: { creatorPercent: 70, platformPercent: 30, permanent: true },
      launchExecution: getEnv().EXECUTE_ENABLED === true ? "enabled (owner approval required for each launch)" : "disabled: tools return previews only",
    }),
  }),
  tool({
    name: "scan_token",
    title: "Scan a token",
    description: "Look up any Solana token by mint address: name, symbol, price, market cap, liquidity, age, links and warnings, from DexScreener, on-chain metadata and the token's own metadata file.",
    shape: { mint: addr.describe("Token mint address") },
    run: async ({ mint }) => fetchToken(mint),
  }),
  tool({
    name: "draft_token",
    title: "Recreate a token with River",
    description: "Scan a token and have River write an improved, original name, ticker, description and image prompt for a new launch inspired by it.",
    shape: { mint: addr },
    heavy: true,
    run: async ({ mint }) => {
      const t = await fetchToken(mint);
      return t.ok ? { ok: true, token: t.token, draft: await optimizeToken(t.token) } : t;
    },
  }),
  tool({
    name: "generate_image",
    title: "Generate a token image",
    description: "Make a square token image from a prompt with FLUX Schnell. Returns a PNG as base64.",
    shape: { prompt: z.string().min(5).max(300) },
    heavy: true,
    run: async ({ prompt }) => {
      const r = await generateImage(prompt, { size: "512x512" });
      return r.ok ? { ok: true, mime: r.mime, base64: r.b64, ms: r.ms } : { ok: false, error: r.error };
    },
  }),
  tool({
    name: "scan_lookalikes",
    title: "Find lookalike tokens",
    description: "Search DexScreener for tokens on Solana with the same or a near-identical name, ticker or address ends. Returns risk scores.",
    shape: { name: z.string().max(60).default(""), ticker: z.string().max(20).default(""), mint: addr.optional() },
    heavy: true,
    run: async (i) => radarScan({ name: i.name, ticker: i.ticker, mint: i.mint }),
  }),
  tool({
    name: "vamp_scan",
    title: "Vamp Radar and Shield scan",
    description: "Paste only a token address: looks the token up, then lists every lookalike (same ticker, same name, matching address ends, liquidity, market cap) and scores how cheap the address is to clone.",
    shape: { mint: addr.describe("Token mint address") },
    heavy: true,
    run: async ({ mint }) => vampScan(mint),
  }),
  tool({
    name: "integrations_health",
    title: "Integrations health",
    description: "Makes one real, minimal, read-only call to every integration (Helius, River, Pinata, Pollinations, Deepgram, pump.fun program, Neon, Upstash, Telegram, treasury, Jupiter, DexScreener) and reports ok, missing or failed with the env var names to fix. Never shows a key or secret.",
    shape: {},
    heavy: true,
    run: async () => integrationsHealth(),
  }),
  tool({
    name: "preview_fee_split",
    title: "Preview the 70/30 fee split",
    description: "Show how creator fees would be shared: 70% to the launcher wallet you give and 30% to the platform treasury. Preview only.",
    shape: { launcherWallet: addr },
    run: async ({ launcherWallet }) => {
      const t = publicEnv.treasuryPubkey;
      if (!t) return { ok: false, error: "The platform treasury address is not set on this server." };
      const clash = treasuryClash(launcherWallet, t);
      if (clash) return { ok: false, error: clash };
      const rows = platformSplit(launcherWallet, t);
      return { ok: true, shareholders: rows, check: validateSplit(rows) };
    },
  }),
  tool({
    name: "simulate_launch",
    title: "Simulate a launch",
    description: "Simulate the pump.fun bonding curve for a dev buy and optional extra buyers. Preview only.",
    shape: { devBuySol: z.number().min(0).max(85), otherBuysSol: z.array(z.number().min(0).max(85)).max(20).default([]) },
    run: async ({ devBuySol, otherBuysSol }) => ({ ok: true, result: simulate([{ wallet: "Dev", sol: devBuySol }, ...otherBuysSol.map((sol, i) => ({ wallet: `Buyer ${i + 1}`, sol }))]) }),
  }),
  tool({
    name: "compare_addresses",
    title: "Check for look-alike addresses",
    description: "Compare two Solana addresses to see if one imitates the other (same start and end, confusable characters).",
    shape: { real: addr, other: addr },
    run: async ({ real, other }) => compareAddresses(real, other),
  }),
  tool({
    name: "vanity_shield_score",
    title: "Vanity shield score",
    description: "How hard it is to forge an address when people only compare n characters at each end.",
    shape: { charactersCompared: z.number().int().min(2).max(8) },
    run: async ({ charactersCompared }) => shieldScore(charactersCompared),
  }),
  tool({
    name: "prepare_launch_package",
    title: "Prepare a launch package",
    description: "Build the metadata and fee split for a launch and return it as a package for the owner to review. This never signs or sends anything: only the owner can approve a launch in the dashboard.",
    shape: { name: z.string().min(1).max(32), ticker: z.string().min(2).max(10), description: z.string().min(1).max(280), launcherWallet: addr, devBuySol: z.number().min(0).max(85).default(0) },
    run: async (i) => {
      const t = publicEnv.treasuryPubkey;
      if (!t) return { ok: false, error: "The platform treasury address is not set on this server." };
      const clash = treasuryClash(i.launcherWallet, t);
      if (clash) return { ok: false, error: clash };
      const split = platformSplit(i.launcherWallet, t);
      const check = validateSplit(split);
      if (!check.ok) return { ok: false, error: check.errors[0] };
      return { ok: true, approvalRequired: true, executed: false, package: { network: publicEnv.network, metadata: buildMetadata({ ...emptyKit, name: i.name, ticker: i.ticker, description: i.description }), shareholders: split, devBuySol: i.devBuySol } };
    },
  }),
  tool({
    name: "project_knowledge",
    title: "How launching works here",
    description: "The full guide to how Rakaza launches tokens: the flow, both launch types, the on-chain steps, how fees are split and sent, how to check your work, and the safety rules. Read this first.",
    shape: {},
    run: async () => ({ ok: true, guide: AGENT_KNOWLEDGE }),
  }),
  tool({
    name: "verify_launch",
    title: "Verify a launch on-chain",
    description: "Check a token end to end with live chain data: it exists, it has a pump.fun curve, our ledger knows it, and its 70/30 fee split on-chain matches what was promised and is locked. Returns every check with a plain reason.",
    shape: { mint: addr },
    heavy: true,
    run: async ({ mint }) => verifyLaunch(mint),
  }),
  tool({
    name: "wallet_fees",
    title: "Fees for a wallet",
    description: "Every token launched through the platform where this wallet receives fees, with its share and the SOL already sent to it.",
    shape: { wallet: addr },
    run: async ({ wallet }) => walletFees(wallet),
  }),
  tool({
    name: "wallet_balance",
    title: "Wallet SOL balance",
    description: "Live SOL balance of any wallet on the platform's network, from Helius.",
    shape: { wallet: addr },
    run: async ({ wallet }) => walletBalance(wallet),
  }),
  tool({
    name: "jupiter_quote",
    title: "Jupiter swap quote",
    description: "A live Jupiter quote for swapping one token for another. Amount is in the input token's smallest unit (lamports for SOL). Quote only, nothing is swapped.",
    shape: { inputMint: addr, outputMint: addr, amount: z.string().regex(/^\d{1,20}$/), slippageBps: z.number().int().min(1).max(1000).default(50) },
    run: async (i) => jupiterQuote(i),
  }),
  tool({
    name: "jupiter_price",
    title: "Jupiter token prices",
    description: "Live USD price, liquidity and 24 hour change for up to 20 tokens from Jupiter.",
    shape: { mints: z.array(addr).min(1).max(20) },
    run: async ({ mints }) => jupiterPrice(mints),
  }),
  tool({
    name: "treasury_health",
    title: "Treasury and gate health",
    description: "Live health of the platform treasury: network, RPC, SOL balance, whether the signing key is ready, whether launching is switched on, and the spend caps. Never shows a key.",
    shape: {},
    run: async () => treasuryHealth(),
  }),
  tool({
    name: "rugcheck_token",
    title: "RugCheck risk report",
    description: "A token's public RugCheck risk score and named risks (mainnet only). Use it on any scanned token before copying it.",
    shape: { mint: addr },
    heavy: true,
    run: async ({ mint }) => rugcheckToken(mint),
  }),
  tool({
    name: "token_authorities",
    title: "Mint and freeze authority",
    description: "Reads a token from the chain: which program owns it, supply, decimals, and whether the mint or freeze authority is still set.",
    shape: { mint: addr },
    run: async ({ mint }) => tokenAuthorities(mint),
  }),
  tool({
    name: "fee_destination",
    title: "Where a coin's creator fees go",
    description: "For a pump.fun coin: whether its creator fees go to traders as cashback, to shareholders on a sharing config, or to the creator, and how much can be paid out now.",
    shape: { mint: addr },
    heavy: true,
    run: async ({ mint }) => feeDestination(mint),
  }),
  tool({
    name: "trust_check",
    title: "Check a fee wallet",
    description: "Before launching to a wallet, check it is a normal wallet that can receive fees (on the curve, not a program, system owned) and see its Said Protocol trust tier.",
    shape: { wallet: addr },
    run: async ({ wallet }) => trustCheck(wallet),
  }),
  tool({
    name: "latest_diary",
    title: "Rakaza's latest diary entry",
    description: "The newest diary entry River wrote from live Solana numbers.",
    shape: {},
    run: async () => currentDiary(),
  }),
];

/** Every tool: the original launch-research tools first (unchanged), then community and token-reading tools. */
export const TOOLS: Tool[] = [...BASE_TOOLS, ...COMMUNITY_TOOLS, ...LAUNCH_TOOLS];
const READ_ONLY = new Set<string>([...COMMUNITY_TOOLS.filter((t) => t.readOnly).map((t) => t.name), ...LAUNCH_TOOLS.filter((t) => t.readOnly).map((t) => t.name), "platform_info", "scan_token", "scan_lookalikes", "vamp_scan", "integrations_health", "preview_fee_split", "simulate_launch", "compare_addresses", "vanity_shield_score", "project_knowledge", "verify_launch", "wallet_fees", "wallet_balance", "jupiter_quote", "jupiter_price", "treasury_health", "rugcheck_token", "token_authorities", "fee_destination", "trust_check", "latest_diary"]);

export function describeTool(t: Tool) {
  const js = z.toJSONSchema(t.schema, { io: "input" }) as Record<string, unknown>;
  delete js.$schema;
  return { name: t.name, title: t.title, description: t.description, inputSchema: js, annotations: { title: t.title, readOnlyHint: READ_ONLY.has(t.name), destructiveHint: false, openWorldHint: true } };
}

export async function callTool(name: string, input: unknown, caller: Caller): Promise<{ ok: true; result: unknown } | { ok: false; status: number; error: string; message: string }> {
  const t = TOOLS.find((x) => x.name === name);
  if (!t) return { ok: false, status: 404, error: "unknown_tool", message: `No tool called ${name}.` };
  const parsed = t.schema.safeParse(input ?? {});
  if (!parsed.success) return { ok: false, status: 400, error: "bad_input", message: parsed.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ") };
  try {
    return { ok: true, result: await t.run(parsed.data as never, caller) };
  } catch (e) {
    if (e instanceof ToolFail) return { ok: false, status: e.status, error: e.code, message: e.message };
    return { ok: false, status: 500, error: "tool_failed", message: "The tool failed. Try again." };
  }
}
