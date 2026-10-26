import type { Metadata } from "next";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";

/**
 * Adds Open Graph + Twitter card tags (title, description, url, summary_large_image) to a page's metadata.
 * With no `image` the 1200x630 site card (/opengraph-image, /twitter-image) is used.
 * Pass `image` (a path or absolute URL, 1200x630) for a page-specific card.
 */
export function withShare(meta: Metadata, path: string, image?: { url: string; alt?: string }): Metadata {
  const raw = typeof meta.title === "string" ? meta.title : meta.title && "absolute" in meta.title ? String(meta.title.absolute) : SITE_NAME;
  const title = /rakaza/i.test(raw) ? raw : `${raw} · ${SITE_NAME}`;
  const description = (meta.description as string | null | undefined) || SITE_TAGLINE;
  const images = [{ url: image?.url ?? "/opengraph-image", width: 1200, height: 630, alt: image?.alt ?? title }];
  return {
    ...meta,
    description,
    openGraph: { type: "website", siteName: SITE_NAME, title, description, url: path, images, ...meta.openGraph },
    twitter: { card: "summary_large_image", title, description, images: [image?.url ?? "/twitter-image"], ...meta.twitter },
  };
}
