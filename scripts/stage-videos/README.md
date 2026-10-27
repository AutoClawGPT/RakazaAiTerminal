# Rakaza stage videos (recorded from the real 3D stage)

The two "Rakaza sings / dances" videos on `/memes` (Videos tab) are recordings of the live 3D stage, so the avatar is exactly the
site's model (`public/models/rakaza.vrm`, same pose rig, same lighting, same lip-sync). Nothing is drawn by hand and no video model is used.
Only the normal stage is recorded, never the 18+ mode.

1. `spectra.mjs <song.mp3> <spec.json>`: headless Chrome decodes the real song and runs it through a real `AnalyserNode` (fft 2048, smoothing 0.3, one snapshot per 1/30 s) with an `OfflineAudioContext`, the same analyser settings the site uses.
2. `feed.ts <song.mp3> <spec.json> <feed.json>` (run with `tsx`): per frame beat position, tempo, energy and mouth levels, computed with the app's own `beat-detect.ts` and `lipsync.ts`.
3. `capture.mjs <feed.json> <startSec> <durSec> <outDir> [size] [scale]`: opens `/talk?rkdebug=1`, takes over the stage through the debug-only `window.__rkCap` hook in `stage-canvas.tsx` (one stage step per fed frame, so the result does not depend on how fast the machine is), moves the camera between 5 shots every 8 beats, adds coloured rim lights, and saves every frame as a transparent PNG of the WebGL canvas. Env: `BASE`, `PUPPETEER_CORE`, `CHROME`, `WARM`, `VSTART`, `SHOTS`.
4. `compose.py <video-id>`: stage-light background, the avatar, karaoke lyrics burned in (word times from faster-whisper word timestamps of the song, spread over each lyric line), a now-playing label with an equaliser, the brand pill and a 2.6 s Rakaza AI Terminal end card, the song audio cut with fades, H.264 + AAC (`yuv420p`, `+faststart`), poster `.jpg` and the 1200x630 share card.

The hook only exists with `?rkdebug` in the URL. Rakaza is a fictional AI character: these are entertainment only, not financial advice.
