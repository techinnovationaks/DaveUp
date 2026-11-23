import type { MetadataRoute } from "next";

/** Web app manifest, so DaveUp can be installed from the browser (Add to Home Screen). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DaveUp",
    short_name: "DaveUp",
    description: "Level up in faith, work and life with people who have your back.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#FFFFFF",
    theme_color: "#1E3A8A",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
