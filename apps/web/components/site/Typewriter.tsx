"use client";

import { useEffect, useState } from "react";

/**
 * Types `lines` out one character at a time, each on its own line, with a
 * blinking caret. The full text is laid out invisibly underneath, so the
 * heading keeps its final size and nothing below it jumps while it types.
 *
 * The server renders the whole text. With the `motion-ok` class (set in
 * layout.tsx before first paint) it stays hidden until typing starts; without
 * JavaScript, or with reduced motion, the full text simply shows.
 */
export function Typewriter({
  lines,
  startDelay = 500,
  speed = 55,
  linePause = 400,
}: {
  lines: string[];
  /** Milliseconds before the first character. */
  startDelay?: number;
  /** Milliseconds per character. */
  speed?: number;
  /** Extra milliseconds at the end of each line. */
  linePause?: number;
}) {
  const total = lines.reduce((n, l) => n + l.length, 0);
  // null = show everything (server render, reduced motion).
  const [typed, setTyped] = useState<number | null>(null);

  useEffect(() => {
    if (!document.documentElement.classList.contains("motion-ok")) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ends = new Set<number>();
    lines.reduce((n, l) => (ends.add(n + l.length), n + l.length), 0);

    let count = 0;
    let timer: ReturnType<typeof setTimeout>;
    setTyped(0);
    const tick = () => {
      count += 1;
      setTyped(count);
      if (count < total) timer = setTimeout(tick, speed + (ends.has(count) ? linePause : 0));
    };
    timer = setTimeout(tick, startDelay);
    return () => clearTimeout(timer);
  }, [lines, total, startDelay, speed, linePause]);

  const shown = typed ?? total;
  let before = 0;
  // The caret sits on the line being typed (the last line with any text).
  let caretLine = 0;
  const parts = lines.map((line, i) => {
    const n = Math.max(0, Math.min(line.length, shown - before));
    before += line.length;
    if (n > 0) caretLine = i;
    return line.slice(0, n);
  });
  const caret = <span className="tw-caret ml-1 inline-block h-[0.85em] w-[0.08em] translate-y-[0.08em] bg-current" />;

  return (
    <>
      <span className="sr-only">{lines.join(" ")}</span>
      <span className="grid" aria-hidden data-typewriter={typed === null ? "idle" : "running"}>
        <span className="invisible col-start-1 row-start-1">
          {lines.map((l, i) => (
            <span key={i} className="block">{l}</span>
          ))}
        </span>
        <span className="tw-typed col-start-1 row-start-1">
          {parts.map((p, i) => (
            <span key={i} className="block min-h-[1lh]">
              {p}
              {i === caretLine && caret}
            </span>
          ))}
        </span>
      </span>
    </>
  );
}
