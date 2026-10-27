"use client";
import { Download, Loader2, Mic2, Play, Square } from "lucide-react";
import { AdultToggle } from "./adult-toggle";
import { FILE_SONGS } from "@/lib/songs";
import { pressSong, requestSong } from "@/lib/stage/motion-bus";
import { useSong } from "@/lib/stage/song-player";
import { usePrep } from "@/lib/stage/song-prep";

/**
 * Rakaza's songs. Press a song and she sings and dances to it in real time (mouth from the vocals, steps from the
 * beat); press it again to stop; press another to switch. Every song also has a Download button. "Sing for me" lets her pick
 * one (after a short get-ready moment) and the 18+ button opens the age-gated club mode.
 */
export function SongPicker({ className = "", compact = false, stacked = false }: { className?: string; compact?: boolean; stacked?: boolean }) {
  const song = useSong();
  const prep = usePrep();
  const pill = compact ? "!min-h-7 !px-2 text-[0.7rem]" : "!min-h-8 text-xs";
  return (
    <div className={`${stacked ? "flex flex-wrap items-center lg:flex-col lg:items-start" : "flex flex-wrap items-center"} gap-1.5 ${className}`} role="group" aria-label="Rakaza songs" data-testid="song-picker">
      {FILE_SONGS.map((s) => {
        const mine = song.id === s.id;
        const playing = mine && song.status === "playing";
        const loading = mine && song.status === "loading";
        const failed = mine && song.status === "error";
        return (
          <span key={s.id} className="inline-flex items-center gap-1">
            <button
              type="button"
              className={`rk-pill ${pill}`}
              aria-pressed={playing || loading}
              data-testid={`song-${s.id}`}
              data-state={mine ? song.status : "idle"}
              title={failed ? song.error : playing ? `Stop ${s.title}` : `Play ${s.title}`}
              onClick={() => pressSong(s)}
            >
              {loading ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : playing ? <Square className="size-3.5" aria-hidden="true" /> : <Play className="size-3.5" aria-hidden="true" />}
              <span>{failed ? "Couldn’t play" : s.title}</span>
            </button>
            <a className={`rk-icon-btn ${compact ? "!size-7" : "!size-8"}`} href={s.src} download={s.file} aria-label={`Download ${s.title}`} title={`Download ${s.title}`} data-testid={`song-dl-${s.id}`}>
              <Download className="size-3.5" aria-hidden="true" />
            </a>
          </span>
        );
      })}
      <button type="button" className={`rk-pill ${pill}`} aria-pressed={prep.active} data-testid="song-random" title="Rakaza picks a song from her songbook for you" onClick={() => requestSong(null)}>
        <Mic2 className="size-3.5" aria-hidden="true" />
        <span>Sing for me</span>
      </button>
      <AdultToggle compact={compact} />
    </div>
  );
}
