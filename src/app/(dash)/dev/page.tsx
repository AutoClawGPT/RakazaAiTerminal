import type { Metadata } from "next";
import { ToolHero, SlidePanel } from "@/components/tools/tool-frame";
import { KeyFileCheck } from "@/components/tools/key-file-check";
import { getRoute } from "@/lib/routes";

export const metadata: Metadata = { title: "Dev" };

const Code = ({ children }: { children: string }) => (
  <pre className="overflow-x-auto rounded-xl bg-[var(--rk-ink,#1b1b1b)] p-3 text-xs leading-relaxed text-white"><code>{children}</code></pre>
);

export default function Page() {
  const r = getRoute("/dev");
  return (
    <>
      <ToolHero kicker={r.kicker} title={r.title} blurb={r.blurb} />
      <section className="rk-container grid max-w-3xl gap-5 py-8 md:py-12">
        <SlidePanel title="Quick start" hint="Four steps, five minutes" defaultOpen>
          <ol className="grid list-decimal gap-3 pl-5 text-sm">
            <li>Open a terminal in the project folder (Node 20 or newer, nothing to install).</li>
            <li>
              Grind three addresses ending in <b>pump</b>, ignoring upper and lower case:
              <Code>{`node cli/rakaza-grind.mjs --end pump --ignore-case --count 3 --out ./keys`}</Code>
              Each match is saved as <code>&lt;address&gt;.json</code>, the same 64-byte format that <code>solana-keygen</code> and wallets read. Files are private to you (mode 600).
            </li>
            <li>Check the file below. It stays in your browser, nothing is uploaded. Compare the address to the Shield score if you are unsure.</li>
            <li>In <b>Launch</b>, open &ldquo;Optional: use a ground address&rdquo; and paste the file. The token is created at that address.</li>
          </ol>
          <div className="mt-4"><KeyFileCheck /></div>
        </SlidePanel>

        <SlidePanel title="Command-line options" hint="node cli/rakaza-grind.mjs ...">
          <ul className="grid gap-1.5 text-sm">
            {[["--start <text>", "address must begin with this. A ? matches any one character."], ["--end <text>", "address must end with this (pump.fun mints end in pump)."], ["--ignore-case", "upper and lower case count as the same, about 2x faster per letter."], ["--count <n>", "stop after n matches (default 1)."], ["--out <dir>", "save each key as <address>.json."], ["--json", "one JSON line per match (secret goes to stdout, pipe it carefully)."], ["--threads <n>", "worker threads (default: all cores but one)."], ["--max-seconds <n>", "stop after n seconds."]].map(([a, b]) => (
              <li key={a}><code className="font-semibold">{a}</code> <span className="text-muted-foreground">{b}</span></li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-muted-foreground">Each extra character makes it 58 times harder (29 times with --ignore-case on a letter). A 4-letter end such as <b>pump</b> takes about 1 to 2 minutes on 8 cores. Five letters takes about an hour.</p>
          <Code>{`npm run grind -- --end pump --ignore-case --count 1 --max-seconds 600`}</Code>
        </SlidePanel>

        <SlidePanel title="Core API" hint="Use the grinder inside your own scripts">
          <Code>{`import { grind, expectedKeys, keypairJson } from "./cli/core/grind.mjs";
import { expectedKeys as odds } from "./cli/core/pattern.mjs";

const patterns = [{ end: "pump", caseSensitive: false }];
console.log("about", Math.round(odds(patterns)), "keys per match");

let found = 0;
await grind({
  patterns,
  threads: 4,                       // 1 = this thread, more = worker threads
  shouldStop: () => found >= 1,
  onProgress: ({ tried, perSecond }) => {},
  onFound: ({ addr, seed, pub }) => {
    found++;
    console.log(addr);
    // keypairJson(seed, pub) is the JSON array to save as <addr>.json
  },
});`}</Code>
          <ul className="mt-3 grid gap-1 text-sm">
            <li><code className="font-semibold">grind(opts)</code> runs until <code>shouldStop()</code> is true. Patterns are <code>{`{ start, end, caseSensitive }`}</code>.</li>
            <li><code className="font-semibold">expectedKeys(patterns)</code> average keys needed for a match (from <code>pattern.mjs</code>).</li>
            <li><code className="font-semibold">keypairJson(seed, pub)</code> the 64-byte keypair as a JSON array string.</li>
            <li><code className="font-semibold">newKey()</code> one fresh key, for tests.</li>
          </ul>
        </SlidePanel>

        <SlidePanel title="Safety" hint="Keys are money">
          <ul className="grid list-disc gap-1.5 pl-5 text-sm">
            <li>Grind on your own machine. Never paste a wallet key into a website you do not control.</li>
            <li>A ground launch address only signs once, when the token is created. It is not a wallet. Never put funds in it.</li>
            <li>Back the file up offline until the token is live. After that it is no longer needed.</li>
            <li>This grinder is our own code and uses the operating system&apos;s random number generator (<code>node:crypto</code>).</li>
          </ul>
        </SlidePanel>
      </section>
    </>
  );
}
