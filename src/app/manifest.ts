import type { MetadataRoute } from "next";
import { SITE_DESCRIPTION } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Rakaza",
    short_name: "Rakaza",
    description: SITE_DESCRIPTION,
    start_url: "/",
    display: "standalone",
    background_color: "#120828",
    theme_color: "#120828",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
