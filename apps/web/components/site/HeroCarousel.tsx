"use client";

import { useEffect, useState } from "react";
import { SiteImage } from "@/components/site/SiteImage";
import type { SiteImageKey } from "@/lib/site-images";

/**
 * Background for the hero: photos that crossfade every few seconds, each with
 * a slow zoom. Fills its parent, which must be positioned. With reduced
 * motion it stays on the first photo; the dots still let people switch.
 */
export function HeroCarousel({ slides, interval = 6500 }: { slides: SiteImageKey[]; interval?: number }) {
  const [active, setActive] = useState(0);
  // The slide fading out keeps its zoom, so it doesn't snap back while it fades.
  const [previous, setPrevious] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);

  const go = (i: number) => {
    if (i === active) return;
    setPrevious(active);
    setActive(i);
  };

  useEffect(() => {
    if (paused || slides.length < 2) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setTimeout(() => go((active + 1) % slides.length), interval);
    return () => clearTimeout(t);
  }, [active, paused, slides.length, interval]);

  // Don't advance while the tab is hidden.
  useEffect(() => {
    const onVis = () => setPaused(document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  return (
    <>
      {slides.map((slot, i) => {
        const on = i === active;
        return (
          <div
            key={slot}
            aria-hidden={!on}
            className={`absolute inset-0 transition-opacity duration-[1400ms] ease-in-out ${on ? "opacity-100" : "opacity-0"}`}
          >
            <SiteImage slot={slot} sizes="100vw" priority={i === 0} className={on || i === previous ? "hero-slide-zoom" : ""} />
          </div>
        );
      })}
      {slides.length > 1 && (
        // Above the overlays (z-10); the hero's text column sits to the left.
        <div className="absolute bottom-6 right-4 z-10 flex gap-2 md:bottom-8 md:right-8" role="group" aria-label="Background photos">
          {slides.map((slot, i) => (
            <button
              key={slot}
              type="button"
              onClick={() => go(i)}
              aria-label={`Show photo ${i + 1} of ${slides.length}`}
              aria-current={i === active}
              className={`h-2 rounded-full transition-all duration-500 ${i === active ? "w-8 bg-white" : "w-2 bg-white/45 hover:bg-white/75"}`}
            />
          ))}
        </div>
      )}
    </>
  );
}
