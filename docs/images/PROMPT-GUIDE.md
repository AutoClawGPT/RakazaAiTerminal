# Rakaza image and video prompt guide

How every Rakaza image is made, so anyone can make another one that looks right. Nothing here needs a secret in the repo: the image key is read from the environment (`POLLINATIONS_API_KEY`) and never committed.

## 1. The avatar (keep it identical in every image)

Rakaza is a cheerful anime VTuber girl. Always include all of these:

- short **violet-indigo bob** haircut with a **hot-pink rim light**
- **large violet eyes** and a **soft, warm smile** (always smiling)
- **purple and pink gaming headset** with a small mic
- **dark indigo tech jacket with pink trim**
- **yellow four-point sparkles** around her
- background: **deep indigo with an electric-violet sunburst** and halftone dots, often a pink or lavender ring behind her head

Reference picture: `public/brand/rakaza-profile.jpg` (also `docs/images/profile.jpg`).

## 2. Style rules

| Element | Value |
|---|---|
| Background | deep indigo `#170a36`, electric-violet sunburst, halftone dots |
| Look | flat vector-like illustration, clean **thick outlines**, high contrast |
| Accents | mustard `#ffc83d`, hot pink, mint-teal |
| Display title (banners) | pale lavender, very wide heavy type, hot-pink offset shadow |
| Cards (UI art) | dark indigo, thick outline, hard pink offset shadow |
| Composition for memes | square, empty space at the top and bottom for captions |
| Text | **never ask the model for text.** Image models spell badly. Add captions afterwards (see section 5) |
| Always | smiling, friendly, no real people, no real brands, no price promises |

## 3. Exact prompts

### Fixed prefix (used for every meme)

```
Rakaza, a cheerful anime VTuber girl with a short violet-indigo bob haircut with hot-pink rim light, large violet eyes, a soft warm smile, a purple gaming headset and a dark indigo tech jacket with pink trim. Flat vector-like illustration, clean thick outlines, deep indigo background with an electric violet sunburst and halftone dots, mustard-yellow four-point sparkles, hot pink and mint accents. Square meme composition with empty space at the top and bottom. No text, no letters, no watermark.
```

Final prompt = prefix + one scene sentence. Model: `flux` (override with `POLLINATIONS_IMAGE_MODEL`), size 1024x1024.

### Scenes and captions

| id | Caption (top / bottom) | Scene sentence |
|---|---|---|
| `gm` | GM / NO SEED PHRASES TODAY | She waves with one hand and holds a steaming coffee mug in the other, sunrise glow behind her. |
| `never-share` | NEVER SHARE / YOUR SEED PHRASE | She holds up a big glowing violet shield with a padlock on it and gives a confident smile. |
| `devnet-first` | DEVNET FIRST / ALWAYS | She gives a thumbs up with a big smile while a small cartoon rocket lifts off beside her. |
| `read-the-chart` | I READ THE CHART / SO YOU STAY CALM | She smiles and holds a magnifying glass up to a floating candlestick chart with green and pink candles. |
| `dyor` | DYOR / I WILL WAIT | She sits cross-legged with a notebook and a magnifying glass, smiling patiently. |
| `3am` | STILL LAUNCHING / AT 3AM | She sits at a glowing keyboard at night with a laptop, sleepy but smiling, a small moon in the window. |
| `keep-100` | SELF LAUNCH / YOU KEEP 100% | She hugs a small round coin mascot with a happy face and smiles proudly. |
| `seventy-thirty` | SPONSORED LAUNCH / 70% YOU, 30% ME | She makes a peace sign with a cheerful wink-free smile, confetti falling around her. |

These live in `src/lib/memes.json`, which is also what the `/memes` page reads.

### Brand banner (from `docs/images/PROMPTS.md`)

> Wide banner for a Solana token launchpad called "RAKAZA". Deep indigo background #170a36 with an electric violet sunburst radiating from the left, halftone dots. Huge wide heavy display title "RAKAZA" in pale lavender with a hot pink offset drop shadow. Mustard #ffc83d small label chips and a mint-teal rounded CTA button. Thick-outlined dark cards with hard pink offset shadows showing a rocket icon and a 70/30 donut chart. On the right a cheerful violet-haired anime VTuber girl with a gaming headset, waving. Clean flat vector-like illustration, high contrast, no text other than RAKAZA, SOLANA, pump.fun, Launch, Enter App, 70/30.

Variants: **profile** = "square avatar crop, same character, shoulders up, headset, sunburst background, no text". **twitter header** = "3:1 ultra wide banner, character on the right third, RAKAZA title on the left, same palette".

## 4. Making a new meme

1. Add an entry to `src/lib/memes.json`: `id`, `top`, `bottom`, `alt`, `scene` (one sentence: pose, prop, mood).
2. Run `node --env-file=.env.local scripts/gen-memes.mjs <id>` (needs `POLLINATIONS_API_KEY` in the environment). It generates the art, caches it in `.meme-raw/` (git-ignored), overlays the caption and writes `public/memes/<id>.jpg` at 768x768, JPEG quality 80 (about 60-90 KB).
3. Look at the result. If the face drifted, re-run with a fresh raw image (delete `.meme-raw/<id>.jpg`) or tighten the scene sentence.
4. Commit the new `.jpg` and the JSON. The page shows Download and Share on X for it automatically.

Captions: bold sans, white fill, thick indigo outline, top and bottom, upper case, font size shrinks to fit 690 px width.

## 5. Image API call (what the script and the Studio send)

`POST https://gen.pollinations.ai/v1/images/generations` with header `Authorization: Bearer <key>` and JSON `{"model": "flux", "prompt": "<prefix + scene>", "size": "1024x1024", "n": 1}`. The response has `data[0].b64_json`. In the app this is `src/lib/pollinations.ts`; the Studio calls it from an owner-only server action.

## 6. Video and slopcore recipe

Videos and slopcore clips are live on `/memes`. They are cut from the same smiling avatar art with ffmpeg only (no video model, no API key): `node scripts/make-videos.mjs`.

1. Start from the uncaptioned 1024 px art (`.meme-raw/<id>.jpg`, written by `scripts/gen-memes.mjs`). The face never changes because the clips only move the camera over real frames, so she keeps smiling.
2. Video memes: 1:1, 720x720, 5 s, 25 fps. One slow move (zoom in, drift, zoom out or a pulse) with `scale` + `crop` driven by `t`, a top caption and a bottom caption that appears later (`drawtext`, DejaVu Sans bold, white or mustard fill, indigo `#170a36` stroke).
3. Slopcore: 9:16, 540x960, about 5 s. Eight 0.625 s shots cut with `concat`, each with a shake (`sin(t*..)` in the crop offset), a zoom pulse, an RGB split (`rgbashift`) or small hue shift, a purple tint (`drawbox` with `#a855f7` at 22%), one huge word and a scrolling marquee line, light film grain (`noise`) and a quiet synthesized kick on every cut (`aevalsrc`, AAC 48 kbps). Keep the palette purple, pink and mustard.
4. Encode H.264, `yuv420p`, `-movflags +faststart`, CRF 28 (the script raises the CRF until the file is under 2 MB). Posters are one frame of each clip.
5. Every item also gets a 1200x630 share card in `public/memes/og/<id>.jpg` and its own page `/memes/<id>`, so Share on X posts that page URL and X shows the card.
6. Add the entry to `clips` in `src/lib/memes.json` (`kind` is `video` or `slopcore`).

## 7. Safety

No secrets in prompts, scripts or committed files. No real people. No claims about returns or price. Keep it fun and friendly.
