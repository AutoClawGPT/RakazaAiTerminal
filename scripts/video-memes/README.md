# Rakaza video memes and slopcore clips

Python pipeline that builds `public/memes/video/*.mp4` and `public/memes/slopcore/*.mp4` (plus posters and the 1200x630 cards in `public/memes/og/`).

- `script.py`: the clip scripts (spoken line + on-screen words + art + camera + stickers). Edit this to add or change a clip.
- `tts.py`: one Deepgram `aura-2-luna-en` voice call per line, cached by text. The key is read from the `DEEPGRAM_API_KEY` environment variable only; nothing is stored here.
- `audio.py`: trims and loudness-matches each line, adds a synthesized beat that ducks under the voice, and returns the line timings.
- `render.py`: draws every frame (camera zoom/pan/shake that bounces with the voice, word-by-word captions synced to the line timings, stickers, site screen insets, glitch, RGB split, flashes) and encodes H.264 + AAC with ffmpeg.
- `sheet.py`: makes a contact sheet of a clip for review.

Needs Python 3 with numpy and Pillow, ffmpeg, and the uncaptioned art in `.meme-raw/` (see `scripts/gen-memes.mjs`). Paths inside are for the build box (`/workspace/vid`). `scripts/make-videos.mjs` is the old silent version, kept for history only.
