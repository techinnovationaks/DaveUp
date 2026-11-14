import Image from "next/image";
import { SITE_IMAGES, type SiteImage as Slot, type SiteImageKey } from "@/lib/site-images";

const ICONS: Record<Slot["icon"], React.ReactNode> = {
  church: <path d="M3 21h18M5 21V10l7-5 7 5v11M10 21v-5h4v5M12 2v3M10.5 3.5h3" />,
  family: <path d="M9 7a3 3 0 1 0 0-.01M17 9a2.5 2.5 0 1 0 0-.01M3 21v-1a6 6 0 0 1 12 0v1M14.5 21v-1a4.5 4.5 0 0 1 7-3.7" />,
  phone: <path d="M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM11 18h2" />,
  people: <path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M16 3.5a4 4 0 0 1 0 7.5M18 14a6 6 0 0 1 4 7" />,
  book: <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5zM4 19a2 2 0 0 1 2-2h13" />,
};

/**
 * A homepage picture by slot name (see lib/site-images.ts). Fills its parent,
 * which must be positioned and sized. Slots without a picture yet show a
 * branded navy panel instead of a broken image.
 */
export function SiteImage({ slot, sizes, priority = false, className = "" }: { slot: SiteImageKey; sizes: string; priority?: boolean; className?: string }) {
  const img: Slot = SITE_IMAGES[slot];
  if (img.src) {
    return <Image src={img.src} alt={img.alt} fill sizes={sizes} priority={priority} className={`object-cover ${className}`} />;
  }
  return (
    <div role="img" aria-label={img.alt} className={`absolute inset-0 flex items-center justify-center overflow-hidden bg-gradient-to-br from-brand to-brand-deep ${className}`}>
      <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10" aria-hidden />
      <div className="absolute -bottom-20 -left-12 h-48 w-48 rounded-full bg-white/5" aria-hidden />
      <svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className="relative text-white/70" aria-hidden>
        {ICONS[img.icon]}
      </svg>
    </div>
  );
}
