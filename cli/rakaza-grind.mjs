#!/usr/bin/env node
// Rakaza vanity grinder: finds Solana addresses with the start and/or end you choose.
// Examples:
//   node cli/rakaza-grind.mjs --end pump --ignore-case --count 3 --out ./keys
//   node cli/rakaza-grind.mjs --start moon --end pump --json
//   node cli/rakaza-grind.mjs --start A? --threads 4
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { grind, keypairJson, defaultThreads } from "./core/grind.mjs";
import { expectedKeys, humanDuration, validatePattern } from "./core/pattern.mjs";

const HELP = `Rakaza grinder
  --start <text>     address must begin with this ("?" = any character)
  --end <text>       address must end with this (pump.fun mints end in "pump")
  --ignore-case      treat upper and lower case as the same
  --count <n>        stop after n matches (default 1)
  --out <dir>        write each key as <address>.json (standard 64-byte Solana keypair)
  --json             print one JSON line per match instead of text (the secret goes to stdout, so pipe it carefully)
  --threads <n>      worker threads (default: all cores but one)
  --max-seconds <n>  give up after n seconds
  -h, --help         this text`;

const { values: v } = parseArgs({ options: { start: { type: "string" }, end: { type: "string" }, "ignore-case": { type: "boolean" }, count: { type: "string" }, out: { type: "string" }, json: { type: "boolean" }, threads: { type: "string" }, "max-seconds": { type: "string" }, help: { type: "boolean", short: "h" } }, allowPositionals: false });
if (v.help) { console.log(HELP); process.exit(0); }

const pattern = { start: v.start ?? "", end: v.end ?? "", caseSensitive: !v["ignore-case"] };
const problems = validatePattern(pattern);
if (problems.length) { console.error(problems.join("\n") + "\n\n" + HELP); process.exit(2); }
const count = Math.max(1, Number(v.count ?? 1) || 1);
const threads = Math.max(1, Number(v.threads ?? defaultThreads()) || 1);
const maxMs = v["max-seconds"] ? Number(v["max-seconds"]) * 1000 : Infinity;
const outDir = v.out ? resolve(v.out) : null;
if (outDir) mkdirSync(outDir, { recursive: true, mode: 0o700 });

const keys = expectedKeys([pattern]);
const log = (s) => { if (!v.json) console.error(s); };
log(`Looking for ${count} address(es). About ${Math.round(keys).toLocaleString("en-US")} keys on average per match.`);

const t0 = Date.now();
let got = 0;
const saved = new Set();
await grind({
  patterns: [pattern], threads,
  shouldStop: () => got >= count || Date.now() - t0 > maxMs,
  onProgress: ({ tried, perSecond }) => { if (!v.json && process.stderr.isTTY) process.stderr.write(`\r${tried.toLocaleString("en-US")} tried, ${perSecond.toLocaleString("en-US")}/s, about ${humanDuration(keys / Math.max(1, perSecond))} per match   `); },
  onFound: ({ addr, seed, pub }) => {
    if (got >= count || saved.has(addr)) return;
    saved.add(addr); got++;
    const kp = keypairJson(seed, pub);
    if (outDir) writeFileSync(join(outDir, `${addr}.json`), kp, { mode: 0o600 });
    if (v.json) console.log(JSON.stringify({ address: addr, ...(outDir ? { file: join(outDir, `${addr}.json`) } : { keypair: JSON.parse(kp) }) }));
    else console.log(`${addr}${outDir ? `  ->  ${join(outDir, `${addr}.json`)}` : ""}`);
  },
});
if (!v.json && process.stderr.isTTY) process.stderr.write("\n");
if (got < count) { log(`Stopped with ${got} of ${count} found (time limit).`); process.exit(got ? 0 : 1); }
if (!outDir && !v.json) log("Tip: add --out ./keys to save the key files. Nothing was saved.");
