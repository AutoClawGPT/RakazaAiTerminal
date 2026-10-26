# Brand image style and prompts

All brand images (`banner.jpg`, `profile.jpg`, `dashboard-preview.jpg`, `launchpad-preview.jpg`, `share-card.jpg`, `twitter-header.jpg`) share one look, taken from the real app UI. The `tab-*.jpg` and `mobile-strip.jpg` files are **real screenshots** of the running app (devnet), not generated.

## Style tokens

| Element | Value |
|---|---|
| Background | deep indigo `#170a36` |
| Hero | electric-violet **sunburst** (radiating rays) with a halftone dot texture |
| Display title | **pale lavender**, very wide heavy display type, with a **hot-pink offset shadow** |
| Accents | mustard `#ffc83d` (labels, chips, active nav) |
| Call to action | mint-teal pill buttons |
| Cards | dark indigo, **thick outline**, hard **pink offset shadow** (neo-brutalist) |
| Character | violet-haired anime VTuber girl with a headset |

## Prompt template

> Wide banner for a Solana token launchpad called "RAKAZA". Deep indigo background #170a36 with an electric violet sunburst radiating from the left, halftone dots. Huge wide heavy display title "RAKAZA" in pale lavender with a hot pink offset drop shadow. Mustard #ffc83d small label chips and a mint-teal rounded CTA button. Thick-outlined dark cards with hard pink offset shadows showing a rocket icon and a 70/30 donut chart. On the right a cheerful violet-haired anime VTuber girl with a gaming headset, waving. Clean flat vector-like illustration, high contrast, no text other than RAKAZA, SOLANA, pump.fun, Launch, Enter App, 70/30.

Variants: change the subject line for each asset.

- **profile.jpg**: "square avatar crop, same character, shoulders up, headset, sunburst background, no text".
- **twitter-header.jpg**: "3:1 ultra wide banner, character on the right third, RAKAZA title on the left, same palette".
- **dashboard-preview.jpg / launchpad-preview.jpg**: "a stylised dark dashboard UI mockup in the same palette: sidebar, thick-outline cards with pink offset shadows, mint-teal buttons, mustard labels" (use a screenshot of the real app as the reference image if the tool supports it).
- **share-card.jpg**: "a 70/30 split card: big donut chart 70% violet / 30% mint, title 'Permanent 70/30 fee split', same palette".

Tools used: any text-to-image model that accepts reference images (feed it a real screenshot of the dashboard and the avatar). Pollinations FLUX (`https://gen.pollinations.ai/docs`) works for the character and background; add the exact title text in an image editor so it stays crisp.

Real screenshots are captured with headless Chrome at 1440x900 against `npm run dev` (devnet); see `tests/mobile-audit.mjs` for the 390px mobile capture.

See `PROMPT-GUIDE.md` for the exact meme prompts, the avatar description and the video recipe.
