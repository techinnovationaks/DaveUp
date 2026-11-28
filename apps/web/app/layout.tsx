import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Inter } from "next/font/google";
import { SessionProvider } from "@/lib/session";
import { RealtimeProvider } from "@/lib/realtime";
import { CallProvider } from "@/components/call/CallProvider";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
/** Display face for the website's headings (DaveUp.html). */
const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display", display: "swap", weight: ["600", "700", "800"] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://daveup.app"),
  title: "DaveUp: Growth you can see",
  description:
    "Level up in faith, work and life with people who have your back. DaveUp pairs you with a discipler, mentor or coach and shows your progress month by month.",
  applicationName: "DaveUp",
  appleWebApp: { capable: true, title: "DaveUp", statusBarStyle: "default" },
  openGraph: {
    title: "DaveUp: Growth you can see",
    description: "Faith and impact, in one picture. Join or create an organization and grow together.",
    siteName: "DaveUp",
    type: "website",
    images: [{ url: "/brand/og.png", width: 1200, height: 630, alt: "DaveUp" }],
  },
  twitter: { card: "summary_large_image", images: ["/brand/og.png"] },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#1E3A8A" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: the motion script below adds a class to <html> before React loads.
    <html lang="en" className={`${inter.variable} ${display.variable}`} suppressHydrationWarning>
      <head>
        {/* Turn on homepage motion only when JavaScript runs and reduced motion is not requested.
            If the reveal watcher has not started within 3 seconds, switch it off so nothing stays hidden. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var d=document.documentElement;if(!matchMedia('(prefers-reduced-motion: reduce)').matches){d.classList.add('motion-ok');setTimeout(function(){if(!d.dataset.revealReady)d.classList.remove('motion-ok')},3000)}}catch(e){}",
          }}
        />
        {/* Light or dark before the first paint (see lib/theme.ts), so the screen never flashes the wrong colours. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('daveup.theme')||'dark';var l=t==='light'||(t==='system'&&matchMedia('(prefers-color-scheme: light)').matches);document.documentElement.classList.toggle('theme-light',l)}catch(e){}",
          }}
        />
      </head>
      <body className="font-sans antialiased">
        <SessionProvider>
          <RealtimeProvider>
            <CallProvider>{children}</CallProvider>
          </RealtimeProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
