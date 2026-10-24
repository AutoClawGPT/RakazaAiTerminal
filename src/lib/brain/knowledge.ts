/** What the launching agent needs to know about this project. Plain facts only: no keys, no secrets. */
export const AGENT_KNOWLEDGE = `# How Rakaza launches tokens

## The flow
1. Scan a source token (scan_token). 2. River writes an original name, ticker, description and image prompt (draft_token). 3. FLUX Schnell makes the image (generate_image). 4. Optionally grind a vanity mint address in the browser. 5. Set the fee wallet; the split is always 70% to that wallet and 30% to the platform treasury. 6. Simulate the dev buy on the bonding curve (simulate_launch). 7. The owner approves. Nothing is signed until a person approves a plan.

## Two launch types
- Agent launch (free): the platform treasury is the creator and pays. The user only gives the wallet that should receive fees.
- Self launch: the user connects their own wallet, which becomes the creator, signs every step and pays. The platform never holds that key. The split is 95% to the launcher and 5% to the platform as a sponsorship, and the user must confirm it before anything is signed.

## On-chain steps (pump.fun SDK v4)
- Create: createV2Instruction. The mint keypair co-signs. Creator is the treasury (agent launch) or the user's wallet (self launch).
- Split: createFeeSharingConfig then updateFeeSharesV2 with 7000 and 3000 basis points. Admin rights are revoked by that update, so the split can be set only once and is permanent. Do not combine it with holder rewards.
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

## Safety rules
- Money moves only after the owner approves the exact plan (a 10 minute approval ticket bound to the plan), EXECUTE_ENABLED is true, and caps allow it (max per launch and per day).
- Never ask for, show or store a private key or API key. Keys live in the server environment only.
- If a key is wrong or something needs setting up, say exactly what is missing and where to get it, and stop.
- Be honest when something fails. Offer the retry step; the split can be retried safely.
`;
