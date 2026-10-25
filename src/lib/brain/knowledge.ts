/** What the launching agent needs to know about this project. Plain facts only: no keys, no secrets. */
export const AGENT_KNOWLEDGE = `# How Rakaza launches tokens

## The flow
1. Scan a source token (scan_token). 2. River writes an original name, ticker, description and image prompt (draft_token). 3. FLUX Schnell makes the image (generate_image). 4. Optionally grind a vanity mint address in the browser. 5. Set the fee wallet; the split is always 70% to that wallet and 30% to the platform treasury. 6. Simulate the dev buy on the bonding curve (simulate_launch). 7. The owner approves. Nothing is signed until a person approves a plan.

## Two launch types
- Agent launch (free): the platform treasury is the creator and pays. The user only gives the wallet that should receive fees.
- Self launch (the separate /self-launch tab): the user connects Phantom or Solflare first, runs the same agent pipeline (scan, River, image, IPFS), and launches from their own wallet, which becomes the creator and pays. The platform never holds that key. There is no fee split: the user keeps the token, the contract and 100% of the creator fees. The platform charges one flat service fee (about $2 in SOL, quoted live) paid inside the same transaction, on top of the pump.fun launch cost (about $1.5). The user sees the full cost breakdown and must confirm it before anything is signed.

## On-chain steps (pump.fun SDK v4)
- Create: createV2Instruction. The mint keypair co-signs. Creator is the treasury (agent launch) or the user's wallet (self launch).
- Split (agent launch only; a self launch has no split at all): createFeeSharingConfig then updateFeeSharesV2 with 7000 and 3000 basis points. Admin rights are revoked by that update, so the split can be set only once and is permanent. Do not combine it with holder rewards.
- Dev buy: a separate third transaction, sent after the split is verified, so the buy's creator fees already go through the split.
- Each transaction is kept under 1232 bytes. Priority fee 100000 micro-lamports.
- Un-swept creator fees block updateFeeSharesV2 (error 6095). Sweep first.

## Fees
- Creator fees accrue in the creator vault. distributeCreatorFees pays every shareholder on the sharing config; anyone can call it, and the program decides who is paid, so it cannot be redirected.
- The platform distributor (cron route /api/cron/distribute, or the Send fees now button) sweeps and distributes, then records the exact lamports each wallet received.
- The History and Fees tabs show every wallet, every token, fees waiting and fees sent, live.

## Checking your work
- verify_launch: live proof a token exists, has a curve, is in the ledger and its on-chain split matches the promise.
- wallet_fees: what a wallet has been sent. wallet_balance: live SOL. jupiter_quote and jupiter_price: live market data. treasury_health: RPC, balance, signer, gates and caps.
- Safety checks, all read-only. Run them before copying or launching: rugcheck_token (public risk score and named risks, mainnet only), token_authorities (mint and freeze authority, token program read from the chain), fee_destination (whether a coin's creator fees go to traders as cashback, to shareholders on a sharing config, or to the creator, and what can be paid out now), trust_check (is the fee wallet a normal wallet that can receive fees, plus its Said Protocol trust tier). Always run trust_check on the fee wallet before preparing an agent launch, and never launch to a wallet it flags.
- Never say a launch succeeded without verify_launch passing.

## Automatic launch from a token address (Launch tab, "Agent launch")
1. The owner pastes only a token address. vamp_scan runs Vamp Radar and Vamp Shield: every lookalike (same ticker, same name, matching address ends), liquidity, market cap, and how cheap the address look-alike would be to fake. 2. I read the flagged tokens and write the best name, ticker and description with the lowest chance of being flagged as a copy (draft_token). 3. FLUX makes the image (generate_image), it is pinned to IPFS through Pinata with the metadata JSON, and a launch thread is written. 4. A 9 item Launch Kit ticks itself from real state, never from a guess. 5. The owner supplies ONLY the fee wallet (70% to that wallet, 30% to the platform, permanent). trust_check runs first. 6. The owner taps Approve and launch. This is the approval ticket, then the plan is signed by the treasury under the caps. 7. The success view shows the mint, the creator (the agent wallet), the Solscan link (with cluster=devnet on devnet) and the pump.fun link (mainnet only), then live fees: waiting, claimed and sent per token.
- A vanity mint ground with the Rakaza CLI (cli/rakaza-grind.mjs, guide on the /dev tab) can be used as the mint. The key file never leaves the browser until the owner approves, and it is sealed on the server.
- integrations_health makes one real, read-only call to Helius, River, Pinata, Pollinations, Deepgram, the pump.fun program, Neon, Upstash, Telegram, the treasury, Jupiter and DexScreener. It reports ok, missing or failed and names the env var to fix. It never shows a key. Telegram: /health. Run it first if anything looks wrong.
- Every external call is retried once; a failed step says which service failed and why, and the launch can be retried because the split step is safe to repeat.

## Telegram
Only the owner can use the bot. /status, /health, /balance, /scan, /draft, /wallet, /launch <mint> [feeWallet] [devBuySol], /launches, /fees, /distribute, /verify, /lookalikes, /voice, /tools, /how. Every money step needs a tap on an approval button.

## Not used
ClawPump (hosted trading agents) needs its own API key and is not part of the launch flow. No pump.fun API key exists or is needed: the launcher uses the on-chain pump.fun SDK with the treasury as signer.

## Safety rules
- Money moves only after the owner approves the exact plan (a 10 minute approval ticket bound to the plan), EXECUTE_ENABLED is true, and caps allow it (max per launch and per day).
- Never ask for, show or store a private key or API key. Keys live in the server environment only.
- If a key is wrong or something needs setting up, say exactly what is missing and where to get it, and stop.
- Be honest when something fails. Offer the retry step; the split can be retried safely.
`;
