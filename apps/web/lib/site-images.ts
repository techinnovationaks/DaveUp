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
  /** "For churches": a church gathering. */
  churchTeam: { src: "/images/home/church-gathering.jpg", alt: "People seated at a church gathering, a woman holding an open Bible", icon: "church" },
  /** "Coming next", first tile: small groups. */
  prayerCircle: { src: "/images/home/prayer-circle.jpg", alt: "Four people seated in a circle holding hands in prayer", icon: "people" },
  /** "Coming next", second tile. */
  openBibles: { src: "/images/home/open-bibles.jpg", alt: "A row of people with open Bibles on their laps", icon: "book" },

  // ---- Photo strip under "Why DaveUp" ----
  bibleReading: { src: "/images/home/bible-reading.jpg", alt: "A young man reading his Bible during a church service", icon: "book" },
  worshipAtHome: { src: "/images/home/worship-at-home.jpg", alt: "Young people worshipping together in a living room with a guitar", icon: "people" },
  friendsTogether: { src: "/images/home/friends-together.jpg", alt: "Four friends sitting together on a sofa, talking and laughing", icon: "people" },
} satisfies Record<string, SiteImage>;

export type SiteImageKey = keyof typeof SITE_IMAGES;
