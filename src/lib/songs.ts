/**
 * Songs Rakaza performs. Each one is a real audio file in /public/songs (generated for this project).
 * To add a song: drop the mp3 into public/songs and add an entry here. The beat grid, tempo, lip-sync and dance
 * are all derived from the audio itself when the song starts, nothing else needs to be configured.
 */
export type SongDef = { id: string; title: string; src: string; file: string; lyrics: string[] };

/** Lyrics the songs were written from (section tags in [brackets] are shown as small labels). */
const LAUNCH_LYRICS = [
  "[Intro]",
  "Hey, hey, Rakaza!",
  "[Verse]",
  "Rakaza drafts your pump dot fun launch on Solana",
  "Devnet first, you sign it, you're in control, yeah",
  "Sponsored launch, seventy for you, thirty to the agent",
  "Or self launch and keep it all, one hundred percent",
  "[Chorus]",
  "Rakaza AI Terminal, launch it, launch it",
  "River AI brain, it's electric",
  "Agents sign in with skill dot m d",
  "Do your own research, it's not financial advice",
  "Rakaza, Rakaza, let's go!",
];

export const FILE_SONGS: SongDef[] = [
  { id: "launch", title: "Rakaza Launch", src: "/songs/rakaza-song-1.mp3", file: "rakaza-song-1.mp3", lyrics: LAUNCH_LYRICS },
  { id: "launch-v2", title: "Rakaza Launch v2", src: "/songs/rakaza-song-2.mp3", file: "rakaza-song-2.mp3", lyrics: LAUNCH_LYRICS },
];

export const songById = (id: string) => FILE_SONGS.find((s) => s.id === id);

const LAST_KEY = "rk-last-song";
/** Remember which songbook song played last, so the next request plays the other one. */
export function rememberSong(id: string) {
  try {
    window.localStorage.setItem(LAST_KEY, id);
  } catch {
    /* private mode: fall back to in-memory rotation */
  }
  lastMem = id;
}
let lastMem: string | null = null;
/** The song to play next from the songbook: rotates, never the one played last. */
export function nextSong(): SongDef {
  let last = lastMem;
  try {
    last = window.localStorage.getItem(LAST_KEY) ?? last;
  } catch {
    /* ignore */
  }
  return FILE_SONGS.find((s) => s.id !== last) ?? FILE_SONGS[0];
}
