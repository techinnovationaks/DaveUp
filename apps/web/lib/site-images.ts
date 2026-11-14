/**
 * Every picture on the public homepage, in one place.
 *
 * To add or replace a picture:
 * 1. Put a web-sized copy in apps/web/public/images/home/ (about 2000px wide,
 *    under 1 MB; Next.js serves smaller versions per screen automatically).
 * 2. Set `src` for its slot below, and describe what it shows in `alt`.
 *
 * A slot with `src: null` shows a branded navy panel with an icon instead, so
 * the page always looks finished while a photo is still to come.
 */
export interface SiteImage {
  src: string | null;
  /** What the picture shows, for screen readers. */
  alt: string;
  /** Icon for the placeholder panel while there is no picture. */
  icon: "church" | "family" | "phone" | "people" | "book";
}

export const SITE_IMAGES = {
  /** Full-width image behind the opening headline. */
  hero: { src: "/images/home/hero-worship.jpg", alt: "A small group praying and worshipping together with open Bibles", icon: "people" },
  /** Beside "How it works": discipleship happens in conversation. */
  smallGroup: { src: "/images/home/small-group.jpg", alt: "A small group sitting in a circle, talking together", icon: "people" },
  /** The walking-together band. */
  fellowship: { src: "/images/home/fellowship.jpg", alt: "Friends sitting together at a table, sharing and laughing", icon: "people" },
  /** Behind the final call to action. */
  reading: { src: "/images/home/reading-together.jpg", alt: "People reading books together around a table", icon: "book" },

  // ---- Slots waiting for pictures ----
  /** "For churches": a pastor or church team. */
  churchTeam: { src: null, alt: "A church leadership team", icon: "church" },
  /** "Coming next": families praying together. */
  family: { src: null, alt: "A family praying together at home", icon: "family" },
  /** "In your pocket": a screenshot or photo of the app on a phone. */
  appPreview: { src: null, alt: "The DaveUp app on a phone", icon: "phone" },
} satisfies Record<string, SiteImage>;

export type SiteImageKey = keyof typeof SITE_IMAGES;
