// Generates the Rakaza memes with the same image pipeline the Studio uses (Pollinations FLUX, POLLINATIONS_API_KEY from the environment).
// Usage: node --env-file=.env.local scripts/gen-memes.mjs [id ...]   -> writes public/memes/<id>.jpg (768x768, captioned) and keeps the raw art in .meme-raw/ (git-ignored)
import fs from "node:fs";
import sharp from "sharp";
const data = JSON.parse(fs.readFileSync(new URL("../src/lib/memes.json", import.meta.url), "utf8"));
const key = process.env.POLLINATIONS_API_KEY;
const model = process.env.POLLINATIONS_IMAGE_MODEL || "flux";
if (!key) { console.error("POLLINATIONS_API_KEY missing from the environment"); process.exit(2); }
const only = process.argv.slice(2);
fs.mkdirSync("public/memes", { recursive: true });
fs.mkdirSync(".meme-raw", { recursive: true });
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
function caption(text, y) {
  const size = Math.min(72, Math.floor(690 / (0.82 * text.length)));
  return `<text x="384" y="${y}" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-weight="900" font-size="${size}" fill="#fff" stroke="#170a36" stroke-width="12" stroke-linejoin="round" paint-order="stroke">${esc(text)}</text>`;
}
for (const m of data.memes) {
  if (only.length && !only.includes(m.id)) continue;
  const raw = `.meme-raw/${m.id}.jpg`;
  if (!fs.existsSync(raw)) {
    const prompt = `${data.style} ${m.scene}`;
    let ok = false;
    for (let t = 0; t < 3 && !ok; t++) {
      const r = await fetch("https://gen.pollinations.ai/v1/images/generations", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, prompt, size: "1024x1024", n: 1 }), signal: AbortSignal.timeout(90000) });
      if (r.ok) { const j = await r.json(); fs.writeFileSync(raw, Buffer.from(j.data[0].b64_json, "base64")); ok = true; } else { console.error(m.id, "status", r.status); await new Promise((x) => setTimeout(x, 2000)); }
    }
    if (!ok) { console.error("failed", m.id); continue; }
  }
  const svg = `<svg width="768" height="768" xmlns="http://www.w3.org/2000/svg">${caption(m.top, 100)}${caption(m.bottom, 720)}</svg>`;
  await sharp(raw).resize(768, 768).composite([{ input: Buffer.from(svg) }]).jpeg({ quality: 80, mozjpeg: true }).toFile(`public/memes/${m.id}.jpg`);
  console.log("ok", m.id);
}
