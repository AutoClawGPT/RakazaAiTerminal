/** Short original verses for Rakaza's Sing button (spoken by her voice over the synth backing). */
export const SONGS: string[] = [
  "La la la, neon lights are glowing. I'm Rakaza, and the beat keeps flowing. Hold on tight, we're riding the night. Ooh, ooh, ooh, everything's alright. Sing it with me, dream big, laugh loud, stay free!",
  "Hey hey, the stars are out tonight. Purple skies and city lights. Clap your hands, move with me. We're the show, we're the energy. Oh oh oh, don't let go, let the music let you glow!",
  "Na na na, spin me round again. Heart goes boom like a drum, then when. Tiny steps, giant dreams. Nothing's ever what it seems. Ooh la la, sing along, Rakaza's got a brand new song!",
];
export const pickSong = (seed = Date.now()) => SONGS[Math.abs(Math.floor(seed)) % SONGS.length];
