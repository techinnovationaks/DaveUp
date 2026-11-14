"use client";
import { useEffect } from "react";

/**
 * Reveals every [data-reveal] element as it scrolls into view (see globals.css).
 * Renders nothing. Marks the page ready so the layout's safety switch keeps
 * motion on.
 */
export function RevealOnScroll() {
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.revealReady = "1";
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (!("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("is-visible"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("is-visible");
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return null;
}
