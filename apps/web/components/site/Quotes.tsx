"use client";
// "Wisdom for the road": quotes that turn by themselves, with previous, pause
// and next. Pauses when someone points at it or prefers less motion.
import { useEffect, useState } from "react";

const QUOTES = [
  { q: "Salvation takes people out of Egypt. Discipleship is what takes them to the promised land.", who: "Rev David Ogbueli", role: "Pastor" },
  { q: "When you learn, teach. When you get, give.", who: "Maya Angelou", role: "Author and activist" },
  {
    q: "Show me a successful individual and I'll show you someone who had real positive influences in his or her life. There was someone cheering you on or showing the way. A mentor.",
    who: "Denzel Washington",
    role: "Actor and director",
  },
  { q: "A mentor is someone who sees more talent and ability within you, than you see in yourself, and helps bring it out of you.", who: "Bob Proctor", role: "Personal development author" },
  { q: "The delicate balance of mentoring someone is not creating them in your own image, but giving them the opportunity to create themselves.", who: "Steven Spielberg", role: "Film director" },
  { q: "A true disciple does not merely admire the Master; he follows His instructions.", who: "Bishop David Oyedepo", role: "Pastor" },
  { q: "A mentor is someone who allows you to see the hope inside yourself.", who: "Oprah Winfrey", role: "Media leader" },
  { q: "If I have seen further, it is by standing on the shoulders of giants.", who: "Isaac Newton", role: "Scientist" },
  { q: "Complete surrender allows God to elevate a person from anywhere to everywhere.", who: "Pastor Enoch Adeboye", role: "Pastor" },
  { q: "Knowing it is not as good as putting it into practice.", who: "Xunzi", role: "Philosopher" },
  { q: "Every action you take is a vote for the type of person you wish to become.", who: "James Clear", role: "Author, Atomic Habits" },
  { q: "Discipleship is the hallmark and bedrock of our Christian expression.", who: "Pastor Poju Oyemade", role: "Pastor" },
];

const initials = (name: string) =>
  name
    .replace(/^(Rev|Pastor|Bishop)\s+/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

export function Quotes() {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hover, setHover] = useState(false);

  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) setPaused(true);
  }, []);
  useEffect(() => {
    if (paused || hover) return;
    const t = setInterval(() => setI((n) => (n + 1) % QUOTES.length), 7000);
    return () => clearInterval(t);
  }, [paused, hover]);

  const q = QUOTES[i]!;
  const go = (d: number) => setI((n) => (n + d + QUOTES.length) % QUOTES.length);
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} className="mx-auto max-w-3xl text-center">
      <span aria-hidden className="block font-display text-[88px] leading-none text-glow-ink md:text-glow">
        &ldquo;
      </span>
      <figure key={i} className="animate-[quote-in_.5s_ease-out]" aria-live={paused ? "polite" : "off"}>
        <blockquote className="font-display text-[24px] font-bold leading-snug tracking-tight text-ink md:text-[32px]">{q.q}</blockquote>
        <figcaption className="mt-8 flex items-center justify-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand text-[14px] font-bold text-white">{initials(q.who)}</span>
          <span className="text-left">
            <span className="block text-[16px] font-bold text-ink">{q.who}</span>
            <span className="block text-[14px] text-ink-muted">{q.role}</span>
          </span>
        </figcaption>
      </figure>
      <div className="mt-8 flex items-center justify-center gap-2">
        <button onClick={() => go(-1)} aria-label="Previous quote" className="flex h-11 w-11 items-center justify-center rounded-full border border-surface-line text-[18px] hover:border-brand hover:text-brand">
          ←
        </button>
        <button onClick={() => setPaused((p) => !p)} className="h-11 rounded-full border border-surface-line px-5 text-[14px] font-semibold hover:border-brand hover:text-brand">
          {paused ? "Play" : "Pause"}
        </button>
        <button onClick={() => go(1)} aria-label="Next quote" className="flex h-11 w-11 items-center justify-center rounded-full border border-surface-line text-[18px] hover:border-brand hover:text-brand">
          →
        </button>
      </div>
      <div className="mt-5 flex justify-center gap-1.5" aria-hidden>
        {QUOTES.map((_, n) => (
          <span key={n} className={`h-1.5 rounded-full transition-all ${n === i ? "w-6 bg-brand" : "w-1.5 bg-surface-line"}`} />
        ))}
      </div>
    </div>
  );
}
