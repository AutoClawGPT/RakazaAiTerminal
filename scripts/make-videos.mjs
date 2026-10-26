// Builds the Rakaza video memes and slopcore clips with ffmpeg only (no API, no keys).
// Input : .meme-raw/<id>.jpg (the uncaptioned 1024px art made by scripts/gen-memes.mjs; git-ignored)
// Output: public/memes/video/*.mp4, public/memes/slopcore/*.mp4, posters + 1200x630 share cards in public/memes/og/
// Usage : node scripts/make-videos.mjs     (needs ffmpeg with libx264 + drawtext, and sharp)
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const ROOT = new URL("..", import.meta.url).pathname;
const RAW = join(ROOT, ".meme-raw");
const FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
const TMP = "/tmp/rakaza-vid";
const MAX_BYTES = 2_000_000;
const INK = "0x170a36", MUSTARD = "0xffc83d", PINK = "0xff4fa3", VIOLET = "0xa855f7";
mkdirSync(TMP, { recursive: true });
for (const d of ["video", "slopcore", "og"]) mkdirSync(join(ROOT, "public/memes", d), { recursive: true });

let tn = 0;
function textFile(s) { const f = join(TMP, `t${tn++}.txt`); writeFileSync(f, s); return f; }
const esc = (p) => p.replace(/:/g, "\\:");
function dt(text, { size, y, color = "white", from = 0, to = 99, bw = 9 }) {
  return `drawtext=fontfile=${FONT}:textfile=${esc(textFile(text))}:expansion=none:fontsize=${size}:fontcolor=${color}:borderw=${bw}:bordercolor=${INK}:x=(w-text_w)/2:y=${y}:enable='between(t,${from},${to})'`;
}

// ---- 1:1 video memes (720x720, 5 s, one slow camera move + two captions) ----
const S = 720, FPS = 25;
const VIDEOS = [
  { id: "gm-zoom", src: "gm", dur: 5, zoom: "1+0.16*t/5", pan: "0", top: "GM", bottom: "NO SEED PHRASES TODAY", bottomAt: 1.2, text: "GM. No seed phrases today." },
  { id: "devnet-liftoff", src: "devnet-first", dur: 5, zoom: "1.18-0.04*t/5", pan: "-60+120*t/5", top: "DEVNET FIRST", bottom: "ALWAYS", bottomAt: 2, text: "Devnet first. Always." },
  { id: "shield-up", src: "never-share", dur: 5, zoom: "1.22-0.2*t/5", pan: "14*sin(t*9)*max(0,(t-2.4))", top: "NEVER SHARE", bottom: "YOUR SEED PHRASE", bottomAt: 1.5, text: "Never share your seed phrase." },
  { id: "keep-it-all", src: "keep-100", dur: 5, zoom: "1.08+0.05*sin(t*5)", pan: "0", top: "SELF LAUNCH", bottom: "YOU KEEP 100%", bottomAt: 1.5, text: "Self launch: you keep 100%." },
];

// ---- 9:16 slopcore (540x960, ~5 s, fast cuts, shake, RGB glitch, purple grade, marquee, kick drum) ----
const SW = 540, SH = 960;
const SLOP = [
  { id: "gm-glitch", text: "GM GM GM. Slopcore, but safe.", marquee: "GM  GM  GM  NO SEED PHRASES  ", shots: [["gm", "GM"], ["never-share", "NO"], ["gm", "GM"], ["devnet-first", "SEEDS"], ["gm", "GM!!"], ["keep-100", "NO"], ["gm", "GM"], ["seventy-thirty", "SEEDS"]] },
  { id: "devnet-chaos", text: "DEVNET FIRST, ALWAYS.", marquee: "DEVNET FIRST  DEVNET FIRST  ALWAYS  ", shots: [["devnet-first", "DEVNET"], ["3am", "FIRST"], ["devnet-first", "DEVNET"], ["read-the-chart", "ALWAYS"], ["devnet-first", "FIRST"], ["dyor", "ALWAYS"], ["devnet-first", "DEVNET"], ["gm", "FIRST!!"]] },
  { id: "seed-panic", text: "NEVER SHARE YOUR SEED PHRASE.", marquee: "NEVER SHARE  SEED PHRASE  NEVER  ", shots: [["never-share", "NEVER"], ["dyor", "SHARE"], ["never-share", "YOUR"], ["3am", "SEED"], ["never-share", "PHRASE"], ["read-the-chart", "EVER"], ["never-share", "NEVER"], ["keep-100", "EVER!!"]] },
  { id: "launch-3am", text: "Still launching at 3AM.", marquee: "STILL LAUNCHING  AT 3AM  70/30  ", shots: [["3am", "STILL"], ["seventy-thirty", "70"], ["3am", "LAUNCH"], ["keep-100", "100"], ["3am", "ING"], ["devnet-first", "3AM"], ["3am", "STILL"], ["seventy-thirty", "3AM!!"]] },
];

function run(args) {
  const r = spawnSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...args], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr);
}
const enc = (crf) => ["-c:v", "libx264", "-preset", "slow", "-crf", String(crf), "-pix_fmt", "yuv420p", "-r", String(FPS), "-movflags", "+faststart"];

function encodeLean(buildArgs, out) {
  for (const crf of [28, 31, 34, 37]) {
    run(buildArgs(crf, out));
    if (statSync(out).size < MAX_BYTES) return crf;
  }
  throw new Error(`${out} still over 2 MB`);
}

function makeVideo(v) {
  const out = join(ROOT, "public/memes/video", `${v.id}.mp4`);
  const img = join(RAW, `${v.src}.jpg`);
  const vf = [
    `scale=w='trunc(${S}*(${v.zoom})/2)*2':h='trunc(${S}*(${v.zoom})/2)*2':eval=frame`,
    `crop=${S}:${S}:x='(iw-ow)/2+(${v.pan})':y='(ih-oh)/2'`,
    dt(v.top, { size: 78, y: 36, color: MUSTARD }),
    dt(v.bottom, { size: v.bottom.length > 14 ? 52 : 78, y: S - 120, from: v.bottomAt }),
    "setsar=1", "format=yuv420p",
  ].join(",");
  const crf = encodeLean((c, o) => ["-loop", "1", "-framerate", String(FPS), "-t", String(v.dur), "-i", img, "-vf", vf, "-an", ...enc(c), o], out);
  return { out, crf };
}

function makeSlop(c) {
  const out = join(ROOT, "public/memes/slopcore", `${c.id}.mp4`);
  const n = c.shots.length, segDur = 0.625;
  const inputs = [], chains = [];
  c.shots.forEach(([src, word], i) => {
    inputs.push("-loop", "1", "-framerate", String(FPS), "-t", String(segDur), "-i", join(RAW, `${src}.jpg`));
    const z = (1.05 + 0.1 * ((i * 7) % 5) / 4).toFixed(3);
    const fx = [
      "rgbashift=rh=-14:bh=14:gv=4", // RGB split
      "hue=h=18:s=1.5", "rgbashift=rh=22:bh=-22", "hue=h=-20:s=1.6", "rgbashift=gh=-18:bv=12", "hue=h=28:s=1.4", "rgbashift=rv=16:bh=-16", "hue=h=-12:s=1.8",
    ][i % 8];
    chains.push([
      `[${i}:v]scale=-2:'trunc(${SH}*${z}*(1+0.35*t/${segDur})/2)*2':eval=frame`,
      `crop=${SW}:${SH}:x='(iw-ow)/2+34*sin(t*61+${i})':y='(ih-oh)/2+30*sin(t*47+${i * 2})'`,
      "eq=saturation=1.7:contrast=1.2",
      `drawbox=x=0:y=0:w=iw:h=ih:color=${VIOLET}@0.22:t=fill`,
      fx,
      dt(word, { size: Math.min(210, Math.floor(500 / (0.74 * word.length))), y: "(h-text_h)/2-60", color: i % 2 ? MUSTARD : "white", bw: 14 }),
      "setsar=1", `fps=${FPS}`, "format=yuv420p", `trim=duration=${segDur}`, "setpts=PTS-STARTPTS",
    ].join(",") + `[v${i}]`);
  });
  const cat = c.shots.map((_, i) => `[v${i}]`).join("") + `concat=n=${n}:v=1:a=0[cat]`;
  const marq = `drawtext=fontfile=${FONT}:textfile=${esc(textFile(c.marquee.repeat(6)))}:expansion=none:fontsize=64:fontcolor=${MUSTARD}:borderw=8:bordercolor=${INK}:x='-mod(t*520,text_w/6)':y=h-150`;
  const fg = `${chains.join(";")};${cat};[cat]${marq},noise=alls=10:allf=t,format=yuv420p[outv]`;
  const total = n * segDur;
  // kick drum on every cut: pitch-dropping sine, quiet
  const kick = `aevalsrc='0.55*sin(2*PI*(55+140*exp(-mod(t,${segDur})*22))*mod(t,${segDur}))*exp(-mod(t,${segDur})*7)':s=44100:d=${total}`;
  const crf = encodeLean(
    (cr, o) => [...inputs, "-f", "lavfi", "-i", kick, "-filter_complex", fg, "-map", "[outv]", "-map", `${n}:a`, "-t", String(total), ...enc(cr), "-c:a", "aac", "-b:a", "48k", "-shortest", o],
    out,
  );
  return { out, crf };
}

// ---- 1200x630 share card (blurred art behind the full square) + poster ----
async function card(srcJpg, outJpg) {
  const bg = await sharp(srcJpg).resize(1200, 630, { fit: "cover" }).blur(24).modulate({ brightness: 0.55, saturation: 1.3 }).toBuffer();
  const fgSize = 560;
  const fg = await sharp(srcJpg).resize(fgSize, fgSize, { fit: "cover" }).toBuffer();
  const tag = Buffer.from(`<svg width="1200" height="630"><rect x="0" y="574" width="1200" height="56" fill="#170a36" opacity="0.85"/><text x="600" y="612" font-family="DejaVu Sans" font-weight="bold" font-size="28" fill="#ffc83d" text-anchor="middle">RAKAZA  ·  rakaza-ai-terminal.vercel.app</text></svg>`);
  await sharp(bg).composite([{ input: fg, left: 320, top: 8 }, { input: tag }]).jpeg({ quality: 80, mozjpeg: true }).toFile(outJpg);
}

async function strip(frames, outJpg) {
  const bg = await sharp(frames[1]).resize(1200, 630, { fit: "cover" }).blur(26).modulate({ brightness: 0.5, saturation: 1.3 }).toBuffer();
  const h = 560, w = Math.round((h * 9) / 16), gap = 28, total = w * 3 + gap * 2, x0 = Math.round((1200 - total) / 2);
  const comps = [];
  for (let i = 0; i < 3; i++) comps.push({ input: await sharp(frames[i]).resize(w, h, { fit: "cover" }).toBuffer(), left: x0 + i * (w + gap), top: 8 });
  const tag = Buffer.from(`<svg width="1200" height="630"><rect x="0" y="574" width="1200" height="56" fill="#170a36" opacity="0.85"/><text x="600" y="612" font-family="DejaVu Sans" font-weight="bold" font-size="28" fill="#ffc83d" text-anchor="middle">RAKAZA SLOPCORE  ·  rakaza-ai-terminal.vercel.app</text></svg>`);
  await sharp(bg).composite([...comps, { input: tag }]).jpeg({ quality: 80, mozjpeg: true }).toFile(outJpg);
}

const results = [];
const only = process.argv[2];
for (const v of VIDEOS) {
  if (only && only !== v.id) continue;
  const r = makeVideo(v);
  run(["-ss", "1.6", "-i", r.out, "-frames:v", "1", "-q:v", "4", join(ROOT, "public/memes/video", `${v.id}.jpg`)]);
  await card(join(ROOT, "public/memes/video", `${v.id}.jpg`), join(ROOT, "public/memes/og", `${v.id}.jpg`));
  results.push([v.id, statSync(r.out).size, r.crf]);
}
for (const c of SLOP) {
  if (only && only !== c.id) continue;
  const r = makeSlop(c);
  run(["-ss", "0.9", "-i", r.out, "-frames:v", "1", "-q:v", "4", join(ROOT, "public/memes/slopcore", `${c.id}.jpg`)]);
  // 9:16 clips: the share card is a 3-up strip of frames (the face stays visible) on blurred art
  const frames = [];
  for (const [k, t] of [[0, "0.1"], [1, "1.9"], [2, "3.7"]]) {
    const fp = join(TMP, `${c.id}-f${k}.jpg`);
    run(["-ss", t, "-i", r.out, "-frames:v", "1", "-q:v", "3", fp]);
    frames.push(fp);
  }
  await strip(frames, join(ROOT, "public/memes/og", `${c.id}.jpg`));
  results.push([c.id, statSync(r.out).size, r.crf]);
}
// 1200x630 cards for the image memes
import { readdirSync } from "node:fs";
if (!only) for (const f of readdirSync(join(ROOT, "public/memes")).filter((f) => f.endsWith(".jpg"))) await card(join(ROOT, "public/memes", f), join(ROOT, "public/memes/og", f));
console.table(results.map(([id, bytes, crf]) => ({ id, KB: Math.round(bytes / 1024), crf })));
