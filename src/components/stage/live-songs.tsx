"use client";
import { Music } from "lucide-react";
import { SongPicker } from "@/components/stage/song-picker";
import { NowPlaying } from "@/components/stage/now-playing";

/** Song strip under the /live stage (client wrapper so the page itself stays a server component). */
export function LiveSongs() {
  return (
    <div className="border-t-2 border-[var(--rk-ink)] bg-white/70 px-3 py-2.5 text-[var(--rk-ink)]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 font-mono text-[0.7rem] font-bold">
          <Music className="size-3.5" aria-hidden="true" /> Her songs
        </span>
        <SongPicker />
      </div>
      <NowPlaying className="mt-2" />
    </div>
  );
}
