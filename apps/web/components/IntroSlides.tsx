"use client";
import { useEffect, useState } from "react";

/** Welcome slides from the design boards (desktop design, pages 100 to 103). */
export const INTRO_SLIDES = [
  {
    tag: "Discipleship",
    title: "Walk with someone. Make disciples.",
    sub: "One discipler, one clear next step, together.",
    steps: ["Take the 12-area assessment", "Meet regularly and follow a growth plan", "Grow, then help someone else grow"],
  },
  {
    tag: "Department",
    title: "Serve with your whole team.",
    sub: "Know your role, your schedule and who needs care.",
    steps: ["See your team and next service roster", "Send your report in two minutes", "Train for your role, then lead others"],
  },
  {
    tag: "Cell",
    title: "Your small group, every week.",
    sub: "Meet, pray and follow up so no one is forgotten.",
    steps: ["See the next meeting and who is coming", "Share prayer requests and testimonies", "Welcome guests, then multiply the cell"],
  },
  {
    tag: "Family",
    title: "Disciple your home.",
    sub: "Pray and grow together, even when you worship in different places.",
    steps: ["Start a family circle of any size", "Share a short family devotion each week", "Everyone controls what they share"],
  },
] as const;

const INTERVAL_MS = 6000;

/**
 * Rotating welcome text. Pauses on hover and keyboard focus, has a pause
 * button (moving content must be stoppable), and never auto-rotates for
 * people who ask their device for reduced motion.
 */
export function IntroSlides({ onDark = false }: { onDark?: boolean }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [held, setHeld] = useState(false); // hover or focus inside
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const running = !paused && !held && !reduced;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % INTRO_SLIDES.length), INTERVAL_MS);
    return () => clearInterval(t);
  }, [running]);

  const c = onDark
    ? { tag: "bg-white/15 text-white", title: "text-white", sub: "text-white/85", step: "text-white", num: "bg-card text-brand", dot: "bg-card", dotOff: "bg-white/40", ctl: "text-white/80 hover:text-white" }
    : { tag: "bg-brand text-on-brand", title: "text-ink", sub: "text-ink-muted", step: "text-ink", num: "bg-brand text-on-brand", dot: "bg-brand", dotOff: "bg-brand/25", ctl: "text-ink-muted hover:text-ink" };

  return (
    <div
      className="max-w-md"
      role="region"
      aria-roledescription="carousel"
      aria-label="What DaveUp helps with"
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setHeld(false)}
    >
      {/* All slides share one grid cell, so the height never jumps; only the opacity changes. */}
      <div className="grid">
        {INTRO_SLIDES.map((s, i) => {
          const on = i === index;
          return (
            <div
              key={s.tag}
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${INTRO_SLIDES.length}`}
              aria-hidden={!on}
              className={`[grid-area:1/1] transition-opacity duration-700 ease-out motion-reduce:transition-none ${on ? "opacity-100" : "pointer-events-none opacity-0"}`}
            >
              <span className={`mb-5 inline-block rounded-[8px] px-4 py-1.5 text-[13px] font-extrabold uppercase tracking-widest ${c.tag}`}>{s.tag}</span>
              <h2 className={`text-[34px] font-extrabold leading-[1.1] tracking-tight md:text-[40px] lg:text-[48px] lg:leading-[1.08] ${c.title}`}>{s.title}</h2>
              <p className={`mt-3 text-[17px] md:mt-4 md:text-[18px] ${c.sub}`}>{s.sub}</p>
              <ol className="mt-5 space-y-3 md:mt-8 md:space-y-4">
                {s.steps.map((t, n) => (
                  <li key={t} className={`flex items-center gap-3 text-[16px] md:text-[17px] ${c.step}`}>
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-[15px] font-bold ${c.num}`}>{n + 1}</span>
                    {t}
                  </li>
                ))}
              </ol>
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex items-center">
        {INTRO_SLIDES.map((s, i) => (
          // Tall tap targets around a small visible dot, aligned with the text edge.
          <button
            key={s.tag}
            type="button"
            onClick={() => setIndex(i)}
            aria-label={`Show slide ${i + 1}: ${s.tag}`}
            aria-current={i === index ? "true" : undefined}
            className="flex h-11 w-9 items-center justify-start"
          >
            <span className={`block h-2 rounded-full transition-all ${i === index ? `w-6 ${c.dot}` : `w-2 ${c.dotOff}`}`} />
          </button>
        ))}
        {!reduced && (
          <button type="button" onClick={() => setPaused((p) => !p)} className={`ml-1 flex h-11 items-center px-2 text-[13px] font-semibold ${c.ctl}`} aria-pressed={paused}>
            {paused ? "Play" : "Pause"}
          </button>
        )}
      </div>
    </div>
  );
}
