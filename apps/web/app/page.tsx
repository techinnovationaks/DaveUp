// The public homepage: the DaveUp.html design (Nov 2026), ported as it is.
// Markup in components/site/homeMarkup.ts, styles (scoped under .dvh) in
// components/site/daveup-home.css, behaviour in components/site/HomeScripts.tsx.
import type { Metadata } from "next";
import "@/components/site/daveup-home.css";
import { HOME_HTML } from "@/components/site/homeMarkup";
import { HomeScripts } from "@/components/site/HomeScripts";
import { HomeMenu } from "@/components/site/HomeMenu";

export const metadata: Metadata = {
  title: "DaveUp: Growth you can see",
  description:
    "Level up in faith, work and life with people who have your back. DaveUp pairs you with a discipler, mentor or coach and shows your progress month by month. Built for churches, faith-based businesses and organizations.",
  openGraph: {
    title: "DaveUp: Growth you can see",
    description: "Faith and impact, in one picture. Join or create an organization and grow together.",
    siteName: "DaveUp",
    type: "website",
    images: [{ url: "/brand/og.png", width: 1200, height: 630, alt: "DaveUp" }],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/brand/og.png"],
    title: "DaveUp: Growth you can see",
    description: "Faith and impact, in one picture. Join or create an organization and grow together.",
  },
};

export default function HomePage() {
  return (
    <div className="dvh" id="top">
      <div dangerouslySetInnerHTML={{ __html: HOME_HTML }} />
      <HomeMenu />
      <HomeScripts />
    </div>
  );
}
