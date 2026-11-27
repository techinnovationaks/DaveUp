import type { Metadata } from "next";
import Link from "next/link";
import { AREAS } from "@daveup/shared";
import { Logo } from "@/components/Shell";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteImage } from "@/components/site/SiteImage";
import { RevealOnScroll } from "@/components/site/RevealOnScroll";
import { Typewriter } from "@/components/site/Typewriter";
import { HeroCarousel } from "@/components/site/HeroCarousel";
import type { SiteImageKey } from "@/lib/site-images";

/** Photos behind the hero, in order (slot names from lib/site-images.ts). */
const HERO_SLIDES: SiteImageKey[] = ["hero", "churchTeam", "bibleReading", "fellowship"];

/** Hero headline, typed out. */
const HEADLINE = ["Growth you can see."];

/** Animation delay for staggered entrances (see globals.css). */
const delay = (ms: number) => ({ "--d": `${ms}ms` }) as React.CSSProperties;

// Page title and social tags. The theme colour and installed-app name are set in layout.tsx and manifest.ts.
export const metadata: Metadata = {
  title: "DaveUp: Growth you can see",
  description:
    "Level up in faith, work and life with people who have your back. DaveUp pairs you with a discipler, mentor or coach and shows your progress month by month.",
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

// ---- Content: copy from "DaveUp Website Page Update" (Nov 21, 2026). ----

const STEPS = [
  { n: 1, title: "Join", text: "Sign in with your phone or email and join your organization with a code, or create your own." },
  { n: 2, title: "Check in", text: "Answer a short assessment about yourself, and invite someone who knows you to answer about you." },
  { n: 3, title: "Walk together", text: "Meet your discipler, mentor or coach, agree a growth plan, and keep talking in chat." },
  { n: 4, title: "See it grow", text: "Every month a quick 12-question check shows how your Faith and Impact scores moved." },
];

const FEATURES = [
  { title: "Growth you can see", text: "Two scores, Faith and Impact, with a trend line that shows movement month by month.", icon: "M3 3v18h18M7 15l4-4 3 3 5-6" },
  { title: "Twelve areas of life", text: "A balanced picture across 60 questions, 30 about faith and 30 about impact.", icon: "M4 5h7v7H4zM13 5h7v7h-7zM4 14h7v5H4zM13 14h7v5h-7z" },
  { title: "Two perspectives", text: "What you say about yourself, and what someone who knows you says about you.", icon: "M8 7h12M8 12h12M8 17h12M4 7h.01M4 12h.01M4 17h.01" },
  { title: "Growth plans", text: "Small, specific next steps agreed with your discipler, mentor or coach.", icon: "M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9" },
  { title: "Chat and calls", text: "Direct messages, group chats, audio and video calls in one place.", icon: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" },
  { title: "Files and voice notes", text: "Share documents, photos and voice notes. Files are scanned before they open.", icon: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6" },
  { title: "Spaces", text: "Departments, cells, families and teams, each with its own chat.", icon: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" },
  { title: "Monthly check", text: "Twelve questions, a few minutes, a clear trend.", icon: "M21 12a9 9 0 1 1-3-6.7M21 4v5h-5" },
  { title: "Storehouse", text: "A leader-run space for resources your people need.", icon: "M3 9l9-6 9 6v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM9 22V12h6v10" },
  { title: "Privacy by design", text: "Leaders and administrators never read private chats. Calls are not recorded unless everyone agrees each time.", icon: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" },
];

const AUDIENCES = [
  { title: "Churches", text: "Disciple every member, track growth across cells and departments, and see who needs a visit.", slot: "churchTeam" },
  { title: "Campus fellowships", text: "Pair students with mentors and help them grow in faith and in their studies and first jobs.", slot: "friendsTogether" },
  { title: "Coaching and mentorship", text: "Give each mentee a clear plan and a monthly picture of progress.", slot: "smallGroup" },
  { title: "Apprenticeship and training", text: "Walk with apprentices through skills, character and work habits.", slot: "openBibles" },
] as const satisfies readonly { title: string; text: string; slot: SiteImageKey }[];

const PLANS = [
  { name: "Basic", price: "Free forever", note: "3 disciplers, 36 disciples and 3 cells. No card, no time limit." },
  { name: "Standard", price: "₦70,000 / month", note: "Founding price, locked for 12 months (list price ₦100,000). 12 disciplers, 144 disciples, unlimited cells." },
  { name: "Pro and Network", price: "Talk to us", note: "Up to 1,440 disciples and 120 disciplers, or many organizations under one agreement." },
];

const COMING = [
  "Install DaveUp on your phone today from your browser.",
  "App store versions later.",
  "Custom frameworks, so your organization can define its own areas.",
];

const FAQ = [
  { q: "What does it cost?", a: "Basic is free forever. Standard and above are paid, with a founding price for early organizations." },
  { q: "Do I need an organization to use DaveUp?", a: "No. Any organization can create a space and invite people." },
  { q: "Is DaveUp only for Christians?", a: "DaveUp is Christian-first. Its default framework is built on faith, and any organization can adapt labels to fit." },
  { q: "What are Priest and King?", a: "Two lenses for growth. Priest covers your walk with God. King covers your work and impact in the world. Each gets its own score out of 120." },
  { q: "Who sees my answers?", a: "You and the person walking with you. Leaders and administrators never read private chats." },
  { q: "Are chats private?", a: "Yes. Calls are not recorded unless everyone agrees each time." },
  { q: "Can I be in more than one organization?", a: "Yes. Switch between them from your profile." },
  { q: "Will I be graded?", a: "No. There is no overall score. A large gap between Faith and Impact starts a conversation, not a label." },
  { q: "Can I change my discipler?", a: "Yes. Ask your administrator or request a change in the app." },
  { q: "Can I install it?", a: "Yes. Open daveup.app in your browser and choose Add to Home Screen." },
];

// ---- Small building blocks ----

function Section({ id, children, className = "" }: { id?: string; children: React.ReactNode; className?: string }) {
  return (
    <section id={id} className={`scroll-mt-20 px-4 py-20 md:px-8 md:py-28 ${className}`}>
      <div className="mx-auto max-w-6xl min-[1440px]:max-w-[80vw]">{children}</div>
    </section>
  );
}

function Kicker({ children, light = false }: { children: React.ReactNode; light?: boolean }) {
  return <p data-reveal className={`mb-3 text-[13px] font-extrabold uppercase tracking-widest ${light ? "text-white/80" : "text-brand"}`}>{children}</p>;
}

function Heading({ children, light = false }: { children: React.ReactNode; light?: boolean }) {
  return (
    <h2 data-reveal style={delay(80)} className={`text-[30px] font-extrabold leading-tight tracking-tight md:text-[42px] ${light ? "text-white" : "text-ink"}`}>
      {children}
    </h2>
  );
}

function Check() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0 text-brand" aria-hidden>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

const primaryBtn = "rounded-[8px] bg-white px-7 py-4 text-center text-[16px] font-bold text-brand shadow-lg shadow-brand-deep/30 transition-transform hover:-translate-y-0.5 hover:bg-white/90";
const ghostBtn = "rounded-[8px] border border-white/40 px-7 py-4 text-center text-[16px] font-bold text-white hover:bg-white/10";

export default function HomePage() {
  return (
    <div className="bg-white text-ink">
      <SiteHeader />
      <RevealOnScroll />

      <main>
        {/* ---- Hero ---- */}
        <section className="relative flex min-h-[640px] items-end overflow-hidden px-4 pb-20 pt-32 md:min-h-[760px] md:items-center md:px-8 md:pb-24">
          <HeroCarousel slides={HERO_SLIDES} />
          <div className="absolute inset-0 bg-gradient-to-r from-brand-deep/95 via-brand-deep/75 to-brand/40" aria-hidden />
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-brand-deep/60 to-transparent" aria-hidden />
          <div className="relative mx-auto w-full max-w-6xl min-[1440px]:max-w-[80vw]">
            <div className="max-w-2xl text-white">
              <p className="hero-rise mb-4 text-[13px] font-extrabold uppercase tracking-widest text-white/80">Growth, together</p>
              <h1 className="text-[42px] font-extrabold leading-[1.05] tracking-tight md:text-[64px]">
                <Typewriter lines={HEADLINE} startDelay={400} />
              </h1>
              <p style={delay(380)} className="hero-rise mt-6 max-w-xl text-[18px] leading-relaxed text-white/90 md:text-[20px]">
                Level up in faith, work and life, with people who have your back. DaveUp pairs you with a discipler, mentor or coach and shows your progress month by month.
              </p>
              <div style={delay(520)} className="hero-rise mt-9 flex flex-col gap-3 sm:flex-row">
                <Link href="/signup" className={primaryBtn}>
                  Get started free
                </Link>
                <Link href="/register-church" className={ghostBtn}>
                  Create an organization
                </Link>
              </div>
              <p style={delay(660)} className="hero-rise mt-6 text-[14px] text-white/75">
                Christian-first. Open to any church, fellowship, mentoring group or training program.
              </p>
              {/* Proof chips: illustrative figures from the design, not live data. */}
              <ul style={delay(780)} className="hero-rise mt-6 flex flex-wrap gap-2" aria-label="Example progress">
                {["Faith +8 this month", "Impact +5 this month"].map((c) => (
                  <li key={c} className="rounded-full bg-white/15 px-4 py-2 text-[14px] font-semibold text-white backdrop-blur-sm">
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ---- Why DaveUp ---- */}
        <Section className="bg-white">
          <div className="grid gap-12 md:grid-cols-2 md:items-center">
            <div>
              <Kicker>Why DaveUp</Kicker>
              <Heading>Faith and impact, in one picture.</Heading>
            </div>
            <div data-reveal style={delay(160)} className="space-y-5 text-[17px] leading-relaxed text-ink-muted">
              <p>
                Most growth tools measure one thing. DaveUp looks at how you grow in faith and in the work you do, side by side, so the conversation with your discipler,
                mentor or coach starts from something real.
              </p>
            </div>
          </div>
          <div className="mt-14 grid gap-4 sm:grid-cols-3 md:mt-20">
            {(["bibleReading", "worshipAtHome", "friendsTogether"] as const).map((slot, i) => (
              <div key={slot} data-reveal style={delay(i * 120)} className={`group relative aspect-[4/3] overflow-hidden rounded-[8px] shadow-lg ${i === 1 ? "sm:mt-10" : ""}`}>
                <SiteImage slot={slot} sizes="(min-width: 640px) 33vw, 100vw" className="transition-transform duration-700 group-hover:scale-105" />
              </div>
            ))}
          </div>
        </Section>

        {/* ---- How it works ---- */}
        <Section id="how-it-works" className="bg-surface">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center">
            <div data-reveal className="group relative order-2 aspect-[4/5] overflow-hidden rounded-[8px] shadow-xl lg:order-1">
              <SiteImage slot="smallGroup" sizes="(min-width: 1024px) 45vw, 100vw" className="transition-transform duration-700 group-hover:scale-105" />
            </div>
            <div className="order-1 lg:order-2">
              <Kicker>How it works</Kicker>
              <Heading>Four steps, then it keeps going.</Heading>
              <ol className="mt-10 space-y-6">
                {STEPS.map((s) => (
                  <li key={s.n} data-reveal style={delay(120 + s.n * 110)} className="flex gap-5">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px] bg-brand text-[18px] font-extrabold text-white">{s.n}</span>
                    <div>
                      <p className="text-[19px] font-bold text-ink">{s.title}</p>
                      <p className="mt-1 text-[16px] leading-relaxed text-ink-muted">{s.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </Section>

        {/* ---- Features ---- */}
        <Section id="features" className="bg-white">
          <div className="max-w-2xl">
            <Kicker>Features</Kicker>
            <Heading>Everything you need to grow together.</Heading>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {FEATURES.map((f, i) => (
              <div
                key={f.title}
                data-reveal
                style={delay((i % 5) * 90)}
                className="rounded-[8px] border border-surface-line bg-white p-6 transition-[box-shadow,transform,border-color] duration-300 hover:-translate-y-1 hover:border-brand-line hover:shadow-xl"
              >
                <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-[8px] bg-brand-soft text-brand">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d={f.icon} />
                  </svg>
                </span>
                <h3 className="text-[18px] font-bold text-ink">{f.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">{f.text}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* ---- The twelve areas, over the fellowship photo ---- */}
        <section className="relative overflow-hidden px-4 py-20 md:px-8 md:py-28">
          <SiteImage slot="fellowship" sizes="100vw" />
          <div className="absolute inset-0 bg-brand-deep/85" aria-hidden />
          <div className="relative mx-auto max-w-6xl min-[1440px]:max-w-[80vw]">
            <div className="max-w-2xl">
              <Kicker light>The twelve areas</Kicker>
              <Heading light>Faith and impact in every area.</Heading>
              <p data-reveal style={delay(140)} className="mt-4 text-[17px] text-white/85">
                Each area blends questions about faith (Priest) and about impact in work and community (King). Area 11 is all impact.
              </p>
            </div>
            <ol className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {AREAS.map((a) => (
                <li
                  key={a.number}
                  data-reveal
                  style={delay(((a.number - 1) % 3) * 90 + Math.floor((a.number - 1) / 3) * 60)}
                  className="flex items-start gap-4 rounded-[8px] bg-white/10 p-4 backdrop-blur-sm transition-colors duration-300 hover:bg-white/20"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-white text-[15px] font-extrabold text-brand">{a.number}</span>
                  <span>
                    <span className="block text-[16px] font-bold text-white">{a.name}</span>
                    <span className="block text-[14px] text-white/75">{a.tagline}</span>
                  </span>
                </li>
              ))}
            </ol>
            <p data-reveal className="mt-10 max-w-3xl text-[16px] leading-relaxed text-white/85">
              If you leave the default areas as they are, every member gets the same fair picture. Your score is never a grade. When the two scores sit more than 20 points
              apart, DaveUp suggests a conversation, not a label.
            </p>
          </div>
        </section>

        {/* ---- Who it's for ---- */}
        <Section id="who-its-for" className="bg-white">
          <div className="max-w-2xl">
            <Kicker>Who it&apos;s for</Kicker>
            <Heading>For anyone walking with people.</Heading>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {AUDIENCES.map((a, i) => (
              <div key={a.title} data-reveal style={delay(i * 100)} className="group overflow-hidden rounded-[8px] border border-surface-line bg-white transition-shadow hover:shadow-xl">
                <div className="relative aspect-[4/3] overflow-hidden">
                  <SiteImage slot={a.slot} sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw" className="transition-transform duration-700 group-hover:scale-105" />
                </div>
                <div className="p-6">
                  <h3 className="text-[18px] font-bold text-ink">{a.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">{a.text}</p>
                </div>
              </div>
            ))}
          </div>
          <p data-reveal className="mt-8 text-[16px] text-ink-muted">
            <span className="font-bold text-ink">Use your own words.</span> Rename Department, Cell, Family and every other label to fit your organization.
          </p>
        </Section>

        {/* ---- Pricing teaser ---- */}
        <Section id="pricing" className="bg-surface">
          <div className="max-w-2xl">
            <Kicker>Pricing</Kicker>
            <Heading>Start free. Grow when you are ready.</Heading>
          </div>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {PLANS.map((p, i) => (
              <div
                key={p.name}
                data-reveal
                style={delay(i * 100)}
                className={`rounded-[8px] border bg-white p-7 ${p.name === "Standard" ? "border-brand shadow-xl" : "border-surface-line"}`}
              >
                <p className="text-[15px] font-extrabold uppercase tracking-widest text-brand">{p.name}</p>
                <p className="mt-3 text-[28px] font-extrabold text-ink">{p.price}</p>
                {p.note && <p className="mt-2 text-[15px] text-ink-muted">{p.note}</p>}
              </div>
            ))}
          </div>
          <p data-reveal className="mt-8 text-[15px] text-ink-muted">Yearly billing gets 2 months free. Extra capacity is ₦30,000 a month for 3 disciplers, 36 disciples and 3 cells. No free trial. Pay with Paystack by card, bank transfer or USSD.</p>
        </Section>

        {/* ---- Coming next ---- */}
        <Section className="bg-white">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div className="grid grid-cols-2 gap-4">
              <div data-reveal className="relative aspect-[3/4] overflow-hidden rounded-[8px]">
                <SiteImage slot="prayerCircle" sizes="(min-width: 1024px) 25vw, 50vw" />
              </div>
              <div data-reveal style={delay(160)} className="relative mt-10 aspect-[3/4] overflow-hidden rounded-[8px]">
                <SiteImage slot="reading" sizes="(min-width: 1024px) 25vw, 50vw" />
              </div>
            </div>
            <div>
              <Kicker>Coming next</Kicker>
              <Heading>What we are building next.</Heading>
              <ul className="mt-8 space-y-4">
                {COMING.map((c, i) => (
                  <li key={c} data-reveal style={delay(160 + i * 80)} className="flex gap-3 text-[16px] text-ink">
                    <Check />
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Section>

        {/* ---- FAQ ---- */}
        <Section id="faq" className="bg-surface">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
            <div>
              <Kicker>FAQ</Kicker>
              <Heading>Questions people ask.</Heading>
            </div>
            <div data-reveal style={delay(120)} className="divide-y divide-surface-line rounded-[8px] border border-surface-line bg-white">
              {FAQ.map((f) => (
                <details key={f.q} className="group px-6 py-5 [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[17px] font-bold text-ink">
                    {f.q}
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="shrink-0 text-brand transition-transform group-open:rotate-45" aria-hidden>
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </summary>
                  <p className="mt-3 text-[16px] leading-relaxed text-ink-muted">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </Section>

        {/* ---- Final call to action ---- */}
        <section className="relative overflow-hidden px-4 py-24 md:px-8 md:py-32">
          <SiteImage slot="churchTeam" sizes="100vw" />
          <div className="absolute inset-0 bg-gradient-to-br from-brand/95 to-brand-deep/90" aria-hidden />
          <div className="relative mx-auto max-w-3xl text-center text-white">
            <h2 data-reveal className="text-[34px] font-extrabold leading-tight tracking-tight md:text-[48px]">Take the next step together.</h2>
            <p data-reveal style={delay(120)} className="mx-auto mt-5 max-w-xl text-[18px] text-white/85">Join in minutes. Free to start.</p>
            <div data-reveal style={delay(240)} className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
              <Link href="/signup" className={primaryBtn}>
                Get started free
              </Link>
              <Link href="/register-church" className={ghostBtn}>
                Create an organization
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-surface-line bg-white px-4 py-12 md:px-8">
        <div className="mx-auto flex max-w-6xl min-[1440px]:max-w-[80vw] flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <Logo />
            <p className="mt-4 text-[15px] text-ink-muted">Built in Uyo, Nigeria. Christian-first, open to any organization.</p>
          </div>
          <nav className="grid grid-cols-2 gap-x-10 gap-y-3 text-[15px] sm:grid-cols-3" aria-label="Footer">
            <a href="#how-it-works" className="text-ink-muted hover:text-brand">How it works</a>
            <a href="#features" className="text-ink-muted hover:text-brand">Features</a>
            <a href="#pricing" className="text-ink-muted hover:text-brand">Pricing</a>
            <a href="#faq" className="text-ink-muted hover:text-brand">FAQ</a>
            <Link href="/signin" className="text-ink-muted hover:text-brand">Sign in</Link>
            <Link href="/signup" className="text-ink-muted hover:text-brand">Get started</Link>
          </nav>
        </div>
        <p className="mx-auto mt-10 max-w-6xl min-[1440px]:max-w-[80vw] text-[13px] text-ink-faint">&copy; {new Date().getFullYear()} DaveUp.</p>
      </footer>
    </div>
  );
}
