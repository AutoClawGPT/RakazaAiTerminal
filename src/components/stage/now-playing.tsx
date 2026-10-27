"use client";
import { useEffect, useMemo, useRef } from "react";
import { Check, Music } from "lucide-react";
import { songById } from "@/lib/songs";
import { songClock, songSpectrum, useSong } from "@/lib/stage/song-player";
import { PREP_STEPS, usePrep } from "@/lib/stage/song-prep";

const BARS = 16;

/** Which lyric line is being sung: lines get time in proportion to their length, inside the vocal part of the song. */
export function lyricIndex(lines: string[], time: number, duration: number): number {
  const sung = lines.map((l, i) => ({ l, i })).filter((x) => !/^\[.*\]$/.test(x.l));
  if (!sung.length || duration <= 0) return -1;
  const w = sung.map((x) => 0.6 + x.l.length);
  const total = w.reduce((a, c) => a + c, 0);
  const p = Math.min(0.999, Math.max(0, (time / duration - 0.04) / 0.92));
  let acc = 0;
  for (let k = 0; k < sung.length; k++) {
    acc += w[k] / total;
    if (p <= acc) return sung[k].i;
  }
  return sung[sung.length - 1].i;
}

/**
 * The "now playing" card: title, a live equalizer from the song's own audio, the lyrics with the current line
 * highlighted, and (before the song starts) the short "getting ready" steps. Honest copy: songs come from her songbook.
 */
export function NowPlaying({ compact = false, smallNoLyrics = false, className = "" }: { compact?: boolean; /** hide the lyric line below the lg breakpoint (the /talk stage is short on phones) */ smallNoLyrics?: boolean; className?: string }) {
  const song = useSong();
  const prep = usePrep();
  const def = song.id ? songById(song.id) : undefined;
  const playing = song.status === "playing" && !!def;
  const bars = useRef<(HTMLSpanElement | null)[]>([]);
  const fill = useRef<HTMLSpanElement>(null);
  const lyricRef = useRef<HTMLDivElement>(null);
  const idxRef = useRef(-2);
  const lines = def?.lyrics;
  const spoken = useMemo(() => (lines ?? []).map((l, i) => ({ l, i })), [lines]);

  useEffect(() => {
    if (!playing || !lines) return;
    let raf = 0;
    const vals = new Array<number>(BARS).fill(0);
    const loop = () => {
      if (songSpectrum(vals)) vals.forEach((v, i) => { const el = bars.current[i]; if (el) el.style.transform = `scaleY(${(0.08 + v * 0.92).toFixed(3)})`; });
      const { time, duration } = songClock();
      if (fill.current && duration > 0) fill.current.style.width = `${((time / duration) * 100).toFixed(1)}%`;
      const k = lyricIndex(lines, time, duration);
      if (k !== idxRef.current) {
        idxRef.current = k;
        const box = lyricRef.current;
        if (box) {
          box.querySelectorAll<HTMLElement>("[data-line]").forEach((n) => {
            const on = Number(n.dataset.line) === k;
            n.dataset.on = on ? "1" : "0";
          });
          const cur = box.querySelector<HTMLElement>('[data-on="1"]');
          if (cur) box.scrollTo({ top: cur.offsetTop - box.clientHeight / 2 + cur.clientHeight / 2, behavior: "smooth" });
        }
      }
      raf = requestAnimationFrame(loop);
    };
    idxRef.current = -2;
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, lines]);

  if (prep.active) {
    return (
      <div className={`rk-np rounded-2xl border-2 border-[var(--rk-ink)] bg-white/95 p-2.5 text-[var(--rk-ink)] ${className}`} data-testid="song-prep" role="status" aria-live="polite">
        <p className="flex items-center gap-1.5 text-xs font-extrabold">
          <Music className="size-3.5 animate-pulse" aria-hidden="true" /> Crafting a song for you…
        </p>
        <span className="rk-shimmer mt-2 block h-2 overflow-hidden rounded-full bg-[var(--rk-violet)]/20" aria-hidden="true">
          <span className="block h-full rounded-full bg-[var(--rk-pink)]" style={{ width: `${Math.round(prep.progress * 100)}%`, transition: "width 120ms linear" }} />
        </span>
        <ul className={`mt-2 grid gap-0.5 text-[0.7rem] ${compact ? "grid-cols-2" : ""}`}>
          {PREP_STEPS.map((s, i) => (
            <li key={s} className={`flex items-center gap-1 ${i > prep.step ? "opacity-40" : ""}`} data-done={i < prep.step ? "1" : "0"}>
              {i < prep.step ? <Check className="size-3" aria-hidden="true" /> : <span className={`size-1.5 rounded-full bg-[var(--rk-pink)] ${i === prep.step ? "animate-pulse" : ""}`} aria-hidden="true" />}
              {s}
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (!playing || !def) return null;
  return (
    <div className={`rk-np rounded-2xl border-2 border-[var(--rk-ink)] bg-white/95 p-2.5 text-[var(--rk-ink)] ${className}`} data-testid="song-now" data-song={def.id}>
      <div className="flex items-center gap-2">
        <div className="flex h-7 items-end gap-[2px]" aria-hidden="true" data-testid="song-eq">
          {Array.from({ length: BARS }, (_, i) => (
            <span key={i} ref={(el) => { bars.current[i] = el; }} className="block h-7 w-[3px] origin-bottom rounded-sm" style={{ background: i % 3 === 0 ? "var(--rk-pink)" : i % 3 === 1 ? "var(--rk-violet)" : "var(--rk-honey)", transform: "scaleY(0.1)" }} />
          ))}
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs font-extrabold" data-testid="song-now-title">Now playing: {def.title}</p>
          <p className="truncate text-[0.65rem] opacity-70">From Rakaza’s songbook</p>
        </div>
      </div>
      <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-[var(--rk-violet)]/20" aria-hidden="true">
        <span ref={fill} className="block h-full rounded-full bg-[var(--rk-violet)]" style={{ width: "0%" }} />
      </span>
      <div ref={lyricRef} className={`rk-lyrics relative mt-1.5 overflow-hidden ${compact ? "h-[1.5rem]" : "h-[4.6rem]"} ${smallNoLyrics ? "max-lg:hidden" : ""}`} data-testid="song-lyrics" aria-label="Lyrics">
        {spoken.map(({ l, i }) =>
          /^\[.*\]$/.test(l) ? (
            <p key={i} data-line={-1 - i} className="text-[0.6rem] font-bold uppercase tracking-wider opacity-50">{l.slice(1, -1)}</p>
          ) : (
            <p key={i} data-line={i} data-on="0" className="rk-lyric text-[0.78rem] leading-6">{l}</p>
          ),
        )}
      </div>
    </div>
  );
}
