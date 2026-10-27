/**
 * Lip-sync from a song (a full mix, not clean speech). Pure functions over an AnalyserNode's byte spectrum.
 *
 * Vocals-first: only the vowel/formant region (about 300 to 3400 Hz) drives the jaw, the kick/bass is
 * ignored, and the level is normalised against a slowly adapting floor and ceiling so quiet and loud songs
 * both look like singing. Opening is fast, closing is a little slower (attack/release) and a syllable
 * flux term makes the mouth close between sung notes. The spectral centroid of the vocal band picks the
 * vowel: low centroid gives "oo/oh", middle gives "aa", high gives "ee/ih".
 */
export type LipState = { lo: number; hi: number; env: number; cent: number; prev: number; t: number };
export type LipFrame = { level: number; low: number; mid: number; high: number; centroid: number };

export const newLipState = (): LipState => ({ lo: 0.2, hi: 0.5, env: 0, cent: 0.5, prev: 0, t: 0 });

const VOC_LO = 300;
const VOC_HI = 3400;
const BASS_LO = 50;
const BASS_HI = 220;

const tri = (x: number, c: number, w: number) => Math.max(0, 1 - Math.abs(x - c) / w);

/** @param fd byte frequency data (0..255 over -100..-30 dB), @param hzPerBin sampleRate / fftSize, @param dt frame time in seconds */
export function songLipFrame(fd: ArrayLike<number>, hzPerBin: number, st: LipState, dt: number): LipFrame {
  const d = Math.min(0.1, Math.max(0.001, dt));
  const i0 = Math.max(1, Math.floor(VOC_LO / hzPerBin));
  const i1 = Math.min(fd.length - 1, Math.ceil(VOC_HI / hzPerBin));
  let sum = 0;
  let wsum = 0;
  let wf = 0;
  for (let i = i0; i <= i1; i++) {
    const m = fd[i] / 255;
    sum += m;
    const w = m * m * m; // peaks (formants) count more than the floor
    wsum += w;
    wf += w * Math.log(Math.max(i * hzPerBin, 1));
  }
  const vocal = sum / Math.max(1, i1 - i0 + 1);
  let bass = 0;
  const b0 = Math.max(1, Math.floor(BASS_LO / hzPerBin));
  const b1 = Math.max(b0, Math.min(fd.length - 1, Math.ceil(BASS_HI / hzPerBin)));
  for (let i = b0; i <= b1; i++) bass += fd[i] / 255;
  bass /= b1 - b0 + 1;
  // vocal energy with a little of the bass thump removed (a kick should not open the jaw)
  const v = Math.max(0, vocal - 0.25 * Math.max(0, bass - vocal));

  // slow ceiling (decays over about 20 s) and floor (rises over about 40 s), with a minimum range
  st.hi = Math.max(v, st.hi - d * 0.03);
  st.lo = Math.min(v, st.lo + d * 0.015, st.hi * 0.5); // a held note stays open
  const range = Math.max(0.12, st.hi - st.lo);
  const x = Math.min(1, Math.max(0, (v - st.lo) / range));
  const flux = Math.max(0, v - st.prev) / range;
  st.prev += (v - st.prev) * Math.min(1, d * 14);
  let target = Math.pow(x, 1.15) * 0.92 + Math.min(0.35, flux * 3);
  if (v < 0.1) target = 0; // silence
  target = Math.min(1, target);
  const k = target > st.env ? 1 - Math.exp(-d * 30) : 1 - Math.exp(-d * 11);
  st.env += (target - st.env) * k;

  // vowel from the centroid of the vocal band (log scale 300..3400 Hz -> 0..1)
  if (wsum > 1e-6) {
    const cHz = Math.exp(wf / wsum);
    const c = Math.min(1, Math.max(0, Math.log(cHz / VOC_LO) / Math.log(VOC_HI / VOC_LO)));
    st.cent += (c - st.cent) * Math.min(1, d * 9);
  }
  const c = st.cent;
  return {
    level: st.env,
    low: tri(c, 0.12, 0.34) + 0.02,
    mid: tri(c, 0.48, 0.32) + 0.02,
    high: tri(c, 0.86, 0.34) + 0.02,
    centroid: c,
  };
}
