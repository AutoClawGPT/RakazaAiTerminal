import data from "@/lib/memes.json";

export type MemeItem = {
  id: string;
  kind: "image" | "video" | "slopcore";
  /** The downloadable file (jpg or mp4). */
  file: string;
  /** Still shown before a clip plays (the image itself for image memes). */
  poster: string;
  /** 1200x630 card used for og:image / twitter:image. */
  og: string;
  width: number;
  height: number;
  text: string;
  alt: string;
};

export const MEME_ITEMS: MemeItem[] = [
  ...data.memes.map((m): MemeItem => ({ id: m.id, kind: "image", file: `/memes/${m.id}.jpg`, poster: `/memes/${m.id}.jpg`, og: `/memes/og/${m.id}.jpg`, width: 768, height: 768, text: `${m.top} ${m.bottom}`, alt: m.alt })),
  ...data.clips.map((c): MemeItem => ({ id: c.id, kind: c.kind as "video" | "slopcore", file: c.file, poster: c.poster, og: c.og, width: c.width, height: c.height, text: c.text, alt: c.alt })),
];

export const getMeme = (id: string) => MEME_ITEMS.find((m) => m.id === id);
