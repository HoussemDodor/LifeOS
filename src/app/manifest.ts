import type { MetadataRoute } from "next";

/** Lets "Add to Home Screen" open LifeOS full screen, without browser bars. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LifeOS",
    short_name: "LifeOS",
    description: "Personal dashboard",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#13151d",
    theme_color: "#13151d",
    icons: [
      { src: "/app-icon/192", sizes: "192x192", type: "image/png" },
      { src: "/app-icon/512", sizes: "512x512", type: "image/png" },
      { src: "/app-icon/maskable-512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
