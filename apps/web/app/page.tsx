import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Shell";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteImage } from "@/components/site/SiteImage";
import { RevealOnScroll } from "@/components/site/RevealOnScroll";
import { Typewriter } from "@/components/site/Typewriter";
import { HeroCarousel } from "@/components/site/HeroCarousel";
import { Quotes } from "@/components/site/Quotes";
import { Pricing } from "@/components/site/Pricing";
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

// ---- Content: from DaveUp.html (Nov 27, 2026). Anything not built yet is marked "Coming soon". ----

const STEPS = [
  { n: 1, title: "Join", text: "Sign in with your phone, email or Google and join your organization with a code, a link or a search, or create your own." },
  { n: 2, title: "Check in", text: "Answer a short assessment about yourself, and invite someone who knows you to answer about you." },
  { n: 3, title: "Walk together", text: "Meet your discipler, mentor or coach, agree a growth plan, and keep talking in chat." },
  { n: 4, title: "See it grow", text: "Every month a quick 12-question check shows how your Faith and Impact scores moved." },
];

type Feature = { title: string; text: string; icon: string; soon?: boolean; wide?: boolean };
const FEATURES: Feature[] = [
  { title: "Journal", text: "A private place for daily reflections, prayers, gratitude and work wins. You choose what your guide sees, one entry at a time.", icon: "M5 4a2 2 0 0 1 2-2h11v18H7a2 2 0 0 0-2 2V4zM9 7h5M9 11h5" },
  { title: "Spaces", text: "Departments, cells, families and teams, each with its own chat, files and calls.", icon: "M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.9-.9L3 20.5l1.5-4.6A8.4 8.4 0 0 1 3 11.5 8.6 8.6 0 0 1 12 3a8.6 8.6 0 0 1 9 8.5z" },
  { title: "Training", text: "Courses with lessons, videos and handouts, and each person's progress. Group cohorts with sessions and attendance are next.", icon: "M22 9 12 4 2 9l10 5 10-5zM6 11v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5" },
  { title: "Growth plans", text: "Small, specific next steps agreed with your discipler, mentor or coach.", icon: "M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9" },
  { title: "Monthly check", text: "Twelve questions, a few minutes, a clear trend. What you say about yourself, and what someone who knows you says about you.", icon: "M21 12a9 9 0 1 1-3-6.7M21 4v5h-5" },
  { title: "Resource Centre", text: "A shared library of verses, trainings, study packs and sermons your people can open any time.", icon: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" },
  { title: "Files and calls", text: "Share documents and photos, and start voice or video calls from any conversation. Voice notes are next.", icon: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6" },
  { title: "Privacy by design", text: "Leaders and administrators never read private chats or journals. Calls are not recorded. Block anyone you do not want to hear from.", icon: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" },
  { title: "Paid access to join", text: "Charge for a course, cohort or membership. People pay to join, and the money goes to your own account.", icon: "M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6", soon: true },
];

const AUDIENCES = [
  { title: "Churches and ministries", text: "Disciple every member, track growth across cells and departments, and see who needs a visit.", slot: "churchTeam" },
  { title: "Campus fellowships", text: "Pair students with mentors and help them grow in faith and in their studies and first jobs.", slot: "friendsTogether" },
  { title: "Coaching and mentorship", text: "Give each mentee a clear plan and a monthly picture of progress.", slot: "smallGroup" },
  { title: "Apprenticeship and training", text: "Run group courses and walk with apprentices through skills, character and work habits.", slot: "openBibles" },
  { title: "Faith-based businesses", text: "Grow your team in character and performance, and build a culture people want to belong to.", slot: "bibleReading" },
  { title: "CEOs and executives", text: "Find a mentor, join a peer circle and stay accountable while you lead.", slot: "reading" },
] as const satisfies readonly { title: string; text: string; slot: SiteImageKey }[];

const REASONS = [
  { title: "No one slips away unseen", text: "Flags show who has missed a meeting, who has no discipler and who needs a visit, so leaders act early.", soon: true },
  { title: "Know your people", text: "A weekly leader brief and trend views show growth in Faith and Impact across departments and cells.", soon: true },
  { title: "See your disciples multiply", text: "Track each generation, from the 12 you disciple to the 144 they reach and beyond.", soon: true },
  { title: "Every meeting leaves a record", text: "Notes, growth plans and the monthly check carry over, so nothing depends on one leader's memory." },
  { title: "Growth you can show", text: "Two scores and a month by month trend give members, boards and partners something real to point to." },
  { title: "Safe by design", text: "Verified listing, private journals and private chats on every plan." },
];

const FAQ = [
  { q: "What does it cost?", a: "Basic is free forever for one leader and up to 3 members. Paid plans are priced per leader, from ₦5,000 per leader per month on Standard, and members never need a seat of their own." },
  { q: "What is multiplication?", a: "The goal of discipleship is not endless assessments but disciples who make disciples. DaveUp will show how many people you disciple, how many of them now disciple others, and how far the line has reached. Leaders will see names only for the people they disciple directly; deeper generations show as counts. This is coming soon." },
  { q: "Do I need a church to use DaveUp?", a: "No. Churches, faith-based businesses, nonprofits, schools, mentoring groups and CEO circles can all create a space and invite people." },
  { q: "Is DaveUp only for Christians?", a: "DaveUp is Christian-first. Its default framework is built on faith." },
  { q: "What are Priest and King?", a: "Two lenses for growth. Priest covers your walk with God. King covers your work and impact in the world. Each gets its own score out of 120." },
  { q: "Who sees my answers?", a: "You and the person walking with you. Leaders and administrators never read private chats." },
  { q: "Are chats private?", a: "Yes. Calls are not recorded. You can block anyone, and they can no longer message or call you." },
  { q: "Can I be in more than one organization?", a: "Yes, with one account. Switch between them from the top of the app. Your journal stays with you in every organization, and each organization's chats stay inside it." },
  { q: "Will I be graded?", a: "No. There is no overall score. A large gap between Faith and Impact starts a conversation, not a label." },
  { q: "Can I change my discipler?", a: "Yes. Ask your administrator or request a change in the app." },
  { q: "Can I install it?", a: "Yes. Open daveup.app in your browser and choose Add to Home Screen." },
  { q: "Is my journal private?", a: "Yes. Every entry is private unless you choose to share it with your discipler. Leaders and administrators never read journals, and you can delete any entry at any time." },
  { q: "Do members pay?", a: "Members do not need a seat. Each leader includes 12 members, and extra members come in packs of 12 for ₦1,800 a month. Owners and admins who only manage settings are free." },
  { q: "Is there a free trial?", a: "No trial needed. Basic is free forever, so you can start now and upgrade when ready." },
  { q: "Can we charge our own members?", a: "Coming soon on Pro and Network: organizations will be able to require a payment to join a program, paid to your own account through Paystack." },
  { q: "What if a payment fails?", a: "You get a 14 day grace period with everything working. After that the organization returns to Basic. Data is never deleted and nobody is locked out of their own journal." },
];

// ---- Small building blocks ----

function Section({ id, children, className = "", dark = false }: { id?: string; children: React.ReactNode; className?: string; dark?: boolean }) {
  return (
    <section id={id} className={`scroll-mt-20 px-4 py-20 md:px-8 md:py-28 ${dark ? "bg-night text-white" : ""} ${className}`}>
      <div className="mx-auto max-w-6xl min-[1440px]:max-w-[80vw]">{children}</div>
    </section>
  );
}

function Kicker({ children, light = false }: { children: React.ReactNode; light?: boolean }) {
  return <p data-reveal className={`mb-3 text-[12px] font-extrabold uppercase tracking-[0.14em] ${light ? "text-glow" : "text-glow-ink"}`}>{children}</p>;
}

function Heading({ children, light = false, className = "" }: { children: React.ReactNode; light?: boolean; className?: string }) {
  return (
    <h2 data-reveal style={delay(80)} className={`font-display text-[34px] font-extrabold leading-[1.05] tracking-tight md:text-[52px] ${light ? "text-white" : "text-night"} ${className}`}>
      {children}
    </h2>
  );
}

function Soon({ light = false }: { light?: boolean }) {
  return (
    <span className={`ml-2 inline-block rounded-full px-2 py-0.5 align-middle text-[11px] font-bold uppercase tracking-wide ${light ? "bg-glow/15 text-glow" : "bg-glow-ink/10 text-glow-ink"}`}>Coming soon</span>
  );
}

function Icon({ d, className = "" }: { d: string; className?: string }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={d} />
    </svg>
  );
}

/** A score ring (illustrative figures, not live data). */
function Ring({ value, label, sub, color }: { value: number; label: string; sub: string; color: string }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center text-center">
      <div className="relative h-36 w-36">
        <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden>
          <circle cx="60" cy="60" r={r} fill="none" stroke="currentColor" strokeWidth="10" className="text-surface-line" />
          <circle cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(value / 100) * c} ${c}`} />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center font-display text-[34px] font-extrabold text-night">{value}%</span>
      </div>
      <p className="mt-3 font-display text-[22px] font-extrabold text-night">{label}</p>
      <p className="text-[15px] text-ink-muted">{sub}</p>
    </div>
  );
}

const primaryBtn = "rounded-full bg-white px-7 py-4 text-center text-[16px] font-bold text-night shadow-lg shadow-night/30 transition-transform hover:-translate-y-0.5";
const ghostBtn = "rounded-full border border-white/35 px-7 py-4 text-center text-[16px] font-bold text-white transition-colors hover:bg-white/10";
const glass = "rounded-[8px] border border-white/15 bg-white/[0.08] backdrop-blur-md";

export default function HomePage() {
  return (
    <div className="theme-site bg-white text-ink">
      <SiteHeader />
      <RevealOnScroll />

      <main>
        {/* ---- Hero: the photo carousel, now under deep navy with one cyan glow ---- */}
        <section className="relative flex min-h-[680px] items-end overflow-hidden bg-night px-4 pb-20 pt-32 md:min-h-[780px] md:items-center md:px-8 md:pb-24">
          <HeroCarousel slides={HERO_SLIDES} />
          <div className="absolute inset-0 bg-gradient-to-r from-night via-night/85 to-night-2/50" aria-hidden />
          <div className="absolute inset-0 bg-[radial-gradient(800px_460px_at_78%_35%,rgba(1,253,255,.22),transparent_60%),radial-gradient(600px_380px_at_5%_95%,rgba(1,253,255,.12),transparent_60%)]" aria-hidden />
          <div className="relative mx-auto grid w-full max-w-6xl items-center gap-12 min-[1440px]:max-w-[80vw] lg:grid-cols-[1.15fr_0.85fr]">
            <div className="max-w-2xl text-white">
              <p className="hero-rise inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-[12px] font-bold tracking-[0.14em] text-white/90">
                <i className="block h-2 w-2 rounded-full bg-glow" aria-hidden />
                GROWTH, TOGETHER
              </p>
              <h1 className="mt-6 font-display text-[46px] font-extrabold leading-[0.98] tracking-tight md:text-[76px]">
                <Typewriter lines={HEADLINE} startDelay={400} />
              </h1>
              <p style={delay(380)} className="hero-rise mt-6 max-w-xl text-[18px] leading-relaxed text-night-muted md:text-[20px]">
                Level up in faith, work and life, with people who have your back. DaveUp pairs you with a discipler, mentor or coach and shows your progress month by month. Built for
                churches, faith-based businesses and organizations, and the leaders who run them.
              </p>
              <div style={delay(520)} className="hero-rise mt-9 flex flex-col gap-3 sm:flex-row">
                <Link href="/signup" className={primaryBtn}>
                  Get started free
                </Link>
                <Link href="/register-church" className={ghostBtn}>
                  Create an organization
                </Link>
              </div>
              <p style={delay(660)} className="hero-rise mt-5 text-[14px] text-night-muted">
                Christian-first. Open to churches, faith-based businesses, fellowships, mentoring groups and training programs.
              </p>
              {/* Illustrative figures, not live data. */}
              <ul style={delay(780)} className="hero-rise mt-6 flex flex-wrap gap-2.5" aria-label="Example progress">
                {[
                  ["Faith", "+8"],
                  ["Impact", "+5"],
                ].map(([k, v]) => (
                  <li key={k} className="rounded-full border border-white/20 bg-white/[0.08] px-4 py-2 text-[14px] font-bold text-white backdrop-blur-sm">
                    {k} <b className="text-glow">{v}</b> this month
                  </li>
                ))}
              </ul>
            </div>

            {/* A glimpse of the app (example data). */}
            <div style={delay(600)} className="hero-rise relative hidden justify-self-center lg:block" aria-hidden>
              <div className={`${glass} w-[320px] p-5 text-white shadow-[0_40px_80px_-20px_rgba(0,0,0,.6)]`}>
                <div className="flex items-center justify-between text-[12px] text-night-muted">
                  <span className="flex items-center gap-1.5">
                    <b className="flex h-5 w-5 items-center justify-center rounded-md bg-white/20 text-[9px]">MO</b> My Organization ▾
                  </span>
                  <span>Today</span>
                </div>
                <p className="mt-3 font-display text-[24px] font-extrabold">Hey John</p>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  {[
                    ["Faith", 72, "+8"],
                    ["Impact", 49, "+5"],
                  ].map(([k, v, d]) => (
                    <div key={k as string} className="rounded-2xl bg-white/10 p-3">
                      <p className="text-[12px] text-night-muted">{k}</p>
                      <p className="font-display text-[26px] font-extrabold leading-tight">{v}%</p>
                      <p className="text-[12px] font-bold text-glow">{d} this month</p>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/15">
                        <div className="h-full rounded-full bg-glow" style={{ width: `${v}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-3 rounded-2xl bg-white/10 p-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-glow/20 text-[13px] font-bold text-glow">SJ</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] font-bold tracking-wider text-glow">TODAY, 6PM</span>
                    <span className="block text-[14px] font-semibold">Meeting with Sarah</span>
                  </span>
                  <span className="rounded-full bg-white px-3 py-1 text-[12px] font-bold text-night">Prepare</span>
                </div>
              </div>
              <div className={`${glass} absolute -bottom-6 -left-16 flex items-center gap-2 px-4 py-3 text-[13px] font-semibold text-white`}>
                <span className="h-2 w-2 rounded-full bg-glow" />
                Grace just started discipling someone
              </div>
            </div>
          </div>
        </section>

        {/* ---- Life with DaveUp ---- */}
        <Section className="bg-surface">
          <div className="max-w-2xl">
            <Kicker>Life with DaveUp</Kicker>
            <Heading>Discipleship that feels like this.</Heading>
          </div>
          <div className="mt-12 grid gap-5 md:grid-cols-2">
            <div data-reveal className="rounded-[8px] bg-night p-6 text-white md:p-8">
              <div className="rounded-2xl bg-white/[0.08] p-4">
                <p className="text-[11px] font-bold tracking-wider text-glow">THURSDAY, 6PM</p>
                <p className="mt-1 flex items-center justify-between font-semibold">
                  Meeting with Sarah <span className="rounded-full bg-white px-3 py-1 text-[12px] font-bold text-night">Join</span>
                </p>
                <div className="mt-3 space-y-2 text-[14px]">
                  <p className="w-fit rounded-2xl rounded-bl-sm bg-white/15 px-3 py-2">Thursday works.</p>
                  <p className="w-fit rounded-2xl rounded-bl-sm bg-white/15 px-3 py-2">Bring your prayer notes.</p>
                  <p className="ml-auto w-fit rounded-2xl rounded-br-sm bg-glow px-3 py-2 font-semibold text-night">See you then!</p>
                </div>
              </div>
              <h3 className="mt-6 font-display text-[24px] font-extrabold">Walk with someone who has your back</h3>
              <p className="mt-2 text-night-muted">Meet, pray, plan and cheer each other on, all in one place.</p>
            </div>
            <div data-reveal style={delay(100)} className="rounded-[8px] border border-surface-line bg-white p-6 md:p-8">
              <div className="flex gap-3">
                {[
                  ["Faith", "58", "72"],
                  ["Impact", "38", "49"],
                ].map(([k, a, b]) => (
                  <div key={k} className="flex-1 rounded-2xl bg-surface p-4">
                    <p className="text-[13px] font-semibold text-ink-muted">{k}</p>
                    <p className="font-display text-[28px] font-extrabold text-night">
                      {a} <span className="text-ink-faint">→</span> {b}
                    </p>
                  </div>
                ))}
              </div>
              <h3 className="mt-6 font-display text-[24px] font-extrabold text-night">Watch your growth add up</h3>
              <p className="mt-2 text-ink-muted">Two scores and a clear trend show how far you have come.</p>
            </div>
            <div data-reveal style={delay(200)} className="rounded-[8px] border border-surface-line bg-white p-6 md:p-8">
              <div className="rounded-2xl bg-surface p-4">
                <p className="text-[11px] font-bold tracking-wider text-glow-ink">GROUP TRAINING</p>
                <p className="mt-1 font-semibold text-night">Leadership Foundations</p>
                <p className="text-[14px] text-ink-muted">Session 3 of 8, Thursday 6pm</p>
                <div className="mt-3 flex -space-x-2">
                  {["S", "T", "G", "P", "M"].map((l) => (
                    <span key={l} className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-brand text-[12px] font-bold text-white">
                      {l}
                    </span>
                  ))}
                  <span className="pl-4 text-[13px] text-ink-muted">5 learning together</span>
                </div>
              </div>
              <h3 className="mt-6 font-display text-[24px] font-extrabold text-night">
                Train together as a group
                <Soon />
              </h3>
              <p className="mt-2 text-ink-muted">Courses and lessons are here today. Cohorts with sessions and attendance are next.</p>
            </div>
            <div data-reveal style={delay(300)} className="rounded-[8px] bg-gradient-to-br from-night-2 to-night-3 p-6 text-white md:p-8">
              <div className="rounded-2xl bg-white/[0.08] p-4">
                <p className="text-[11px] font-bold tracking-wider text-glow">TEAM CULTURE</p>
                <p className="mt-1 flex items-baseline justify-between font-semibold">
                  Faith at work <span className="font-display text-[26px] font-extrabold text-glow">+12%</span>
                </p>
                <p className="text-[14px] text-night-muted">Your team, growing</p>
              </div>
              <h3 className="mt-6 font-display text-[24px] font-extrabold">Bring faith into the workplace</h3>
              <p className="mt-2 text-night-muted">For faith-based businesses, teams and the leaders who run them.</p>
            </div>
          </div>
        </Section>

        {/* ---- Why DaveUp: Priest and King ---- */}
        <Section className="bg-white">
          <div className="grid gap-14 lg:grid-cols-2 lg:items-center">
            <div>
              <Kicker>Why DaveUp</Kicker>
              <Heading>Faith and impact, in one picture.</Heading>
              <p data-reveal style={delay(160)} className="mt-6 text-[17px] leading-relaxed text-ink-muted">
                Most growth tools measure one thing. DaveUp looks at how you grow in faith and in the work you do, side by side, so the conversation with your discipler, mentor or
                coach starts from something real.
              </p>
              <p data-reveal style={delay(220)} className="mt-4 text-[16px] leading-relaxed text-ink-muted">
                When the two scores sit more than 20 points apart, DaveUp suggests a conversation, not a label. Your score is never a grade.
              </p>
            </div>
            <div data-reveal style={delay(200)} className="rounded-[8px] border border-surface-line bg-surface p-8 md:p-10">
              <div className="grid grid-cols-2 gap-6">
                <Ring value={72} label="Priest" sub="Your walk with God" color="#0891B2" />
                <Ring value={49} label="King" sub="Your work and impact" color="#1E3A8A" />
              </div>
              <p className="mt-6 text-center text-[13px] text-ink-faint">Example scores.</p>
            </div>
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
              <Heading>Four steps to growth you can see.</Heading>
              <ol className="mt-10 space-y-6">
                {STEPS.map((s) => (
                  <li key={s.n} data-reveal style={delay(120 + s.n * 110)} className="flex gap-5">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-night font-display text-[18px] font-extrabold text-glow">{s.n}</span>
                    <div>
                      <p className="font-display text-[20px] font-bold text-night">{s.title}</p>
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
            <Heading>Everything a walk together needs.</Heading>
          </div>
          <div className="mt-12 grid gap-5 lg:grid-cols-3">
            {/* The trend chart (example data) */}
            <div data-reveal className="rounded-[8px] bg-night p-6 text-white lg:col-span-2 md:p-8">
              <h3 className="font-display text-[22px] font-extrabold">Growth you can see</h3>
              <p className="mt-1 text-night-muted">Two scores, Faith and Impact, with a trend line that shows movement month by month.</p>
              <svg viewBox="0 0 600 200" className="mt-6 w-full" role="img" aria-label="Example: Faith rising from 58 to 72 and Impact from 38 to 49, June to November">
                {[40, 60, 80].map((y) => (
                  <g key={y}>
                    <line x1="30" x2="590" y1={200 - y * 2.2} y2={200 - y * 2.2} stroke="rgba(255,255,255,.12)" />
                    <text x="0" y={204 - y * 2.2} fill="#B4C2E8" fontSize="12">
                      {y}
                    </text>
                  </g>
                ))}
                <polyline fill="none" stroke="#01FDFF" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" points="50,72 160,66 270,57 380,50 490,46 580,42" />
                <polyline fill="none" stroke="#C084FC" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" points="50,116 160,112 270,108 380,102 490,96 580,92" />
                {["Jun", "Jul", "Aug", "Sep", "Oct", "Nov"].map((m, i) => (
                  <text key={m} x={42 + i * 108} y="196" fill="#B4C2E8" fontSize="12">
                    {m}
                  </text>
                ))}
              </svg>
              <p className="mt-2 flex gap-5 text-[14px] font-semibold">
                <span className="text-glow">Faith 72%</span>
                <span className="text-[#C084FC]">Impact 49%</span>
                <span className="ml-auto text-[12px] font-normal text-night-muted">Example data.</span>
              </p>
            </div>
            <div data-reveal style={delay(100)} className="rounded-[8px] border border-surface-line bg-surface p-6 md:p-8">
              <h3 className="font-display text-[22px] font-extrabold text-night">
                Multiplication
                <Soon />
              </h3>
              <p className="mt-2 text-ink-muted">See your disciples become disciplers. Track each generation, from the 12 you disciple to the 144 they reach and beyond, with milestones to celebrate.</p>
              <div className="mt-6 flex items-end gap-3">
                {[
                  ["12", "h-12"],
                  ["144", "h-20"],
                  ["1,728", "h-28"],
                ].map(([n, h]) => (
                  <div key={n} className="flex-1 text-center">
                    <div className={`${h} rounded-xl bg-gradient-to-t from-brand to-glow-ink`} />
                    <p className="mt-2 font-display text-[16px] font-extrabold text-night">{n}</p>
                  </div>
                ))}
              </div>
            </div>
            {FEATURES.map((f, i) => (
              <div
                key={f.title}
                data-reveal
                style={delay((i % 3) * 90)}
                className="rounded-[8px] border border-surface-line bg-white p-6 transition-[box-shadow,transform,border-color] duration-300 hover:-translate-y-1 hover:border-brand-line hover:shadow-xl"
              >
                <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-night text-glow">
                  <Icon d={f.icon} />
                </span>
                <h3 className="font-display text-[19px] font-bold text-night">
                  {f.title}
                  {f.soon && <Soon />}
                </h3>
                <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">{f.text}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* ---- Who it's for ---- */}
        <Section id="who-its-for" className="bg-surface">
          <div className="max-w-2xl">
            <Kicker>Who it&apos;s for</Kicker>
            <Heading>Built for every team that grows together.</Heading>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {AUDIENCES.map((a, i) => (
              <div key={a.title} data-reveal style={delay((i % 3) * 100)} className="group overflow-hidden rounded-[8px] border border-surface-line bg-white transition-shadow hover:shadow-xl">
                <div className="relative aspect-[16/10] overflow-hidden">
                  <SiteImage slot={a.slot} sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" className="transition-transform duration-700 group-hover:scale-105" />
                </div>
                <div className="p-6">
                  <h3 className="font-display text-[19px] font-bold text-night">{a.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">{a.text}</p>
                </div>
              </div>
            ))}
          </div>
          <p data-reveal className="mt-8 text-[16px] text-ink-muted">
            <span className="font-bold text-night">Use your own words.</span> Rename Department, Cell, Family and every other label to fit your organization.
            <Soon />
          </p>
        </Section>

        {/* ---- Multiplication (always dark) ---- */}
        <section className="relative overflow-hidden bg-night px-4 py-20 text-white md:px-8 md:py-28">
          <div className="absolute inset-0 bg-[radial-gradient(700px_400px_at_85%_20%,rgba(1,253,255,.18),transparent_60%)]" aria-hidden />
          <div className="relative mx-auto grid max-w-6xl gap-12 min-[1440px]:max-w-[80vw] lg:grid-cols-2 lg:items-center">
            <div>
              <Kicker light>Multiplication</Kicker>
              <Heading light>Disciples who make disciples.</Heading>
              <p data-reveal style={delay(160)} className="mt-6 text-[17px] leading-relaxed text-night-muted">
                The goal of discipleship is not endless assessments. It is people who help others grow. See how many people you disciple, how many of them now disciple others,
                and how far the line has reached.
              </p>
              <p data-reveal style={delay(220)} className="mt-4 text-[14px] text-night-muted">
                Leaders see names only for the people they disciple directly. Deeper generations show as counts. <Soon light />
              </p>
            </div>
            <div data-reveal style={delay(200)} className="grid grid-cols-3 gap-3">
              {[
                ["12", "people you disciple"],
                ["144", "they reach"],
                ["1,728", "and beyond"],
              ].map(([n, l], i) => (
                <div key={n} className={`${glass} p-5 text-center`} style={{ transform: `translateY(${(2 - i) * 18}px)` }}>
                  <p className="font-display text-[34px] font-extrabold text-glow md:text-[44px]">{n}</p>
                  <p className="mt-1 text-[13px] text-night-muted">{l}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---- Words that walk with you ---- */}
        <Section className="bg-white">
          <div className="mb-10 text-center">
            <Kicker>Words that walk with you</Kicker>
            <Heading>Wisdom for the road.</Heading>
          </div>
          <Quotes />
        </Section>

        {/* ---- Pricing (always dark) ---- */}
        <section id="pricing" className="relative scroll-mt-20 overflow-hidden bg-night px-4 py-20 text-white md:px-8 md:py-28">
          <div className="absolute inset-0 bg-[radial-gradient(800px_420px_at_15%_0%,rgba(1,253,255,.14),transparent_60%)]" aria-hidden />
          <div className="relative mx-auto max-w-6xl min-[1440px]:max-w-[80vw]">
            <Kicker light>Pricing</Kicker>
            <Heading light>Pay for the people you stop losing.</Heading>
            <p data-reveal style={delay(140)} className="mt-5 max-w-2xl text-[17px] text-night-muted">
              Basic is free forever. Pay only for the leaders who disciple. Members never need a seat.
            </p>
            <Pricing />
          </div>
        </section>

        {/* ---- Why teams choose DaveUp ---- */}
        <Section className="bg-surface">
          <div className="max-w-2xl">
            <Kicker>Why teams choose DaveUp</Kicker>
            <Heading>Leaders act early. Nothing gets lost.</Heading>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {REASONS.map((r, i) => (
              <div key={r.title} data-reveal style={delay((i % 3) * 90)} className="rounded-[8px] border border-surface-line bg-white p-6">
                <span className="mb-4 block h-1 w-10 rounded-full bg-glow-ink" aria-hidden />
                <h3 className="font-display text-[19px] font-bold text-night">
                  {r.title}
                  {r.soon && <Soon />}
                </h3>
                <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">{r.text}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* ---- FAQ ---- */}
        <Section id="faq" className="bg-white">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
            <div>
              <Kicker>FAQ</Kicker>
              <Heading>Questions, answered.</Heading>
            </div>
            <div data-reveal style={delay(120)} className="divide-y divide-surface-line rounded-[8px] border border-surface-line bg-white">
              {FAQ.map((f) => (
                <details key={f.q} className="group px-6 py-5 [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[17px] font-bold text-night">
                    {f.q}
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="shrink-0 text-glow-ink transition-transform group-open:rotate-45" aria-hidden>
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
          <div className="absolute inset-0 bg-gradient-to-br from-night/95 to-night-2/90" aria-hidden />
          <div className="absolute inset-0 bg-[radial-gradient(600px_300px_at_50%_100%,rgba(1,253,255,.2),transparent_60%)]" aria-hidden />
          <div className="relative mx-auto max-w-3xl text-center text-white">
            <h2 data-reveal className="font-display text-[40px] font-extrabold leading-[1.02] tracking-tight md:text-[64px]">
              Take the next step <span className="text-glow">together.</span>
            </h2>
            <p data-reveal style={delay(120)} className="mx-auto mt-5 max-w-xl text-[18px] text-night-muted">
              Join in minutes. Free to start.
            </p>
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

      <footer className="bg-night px-4 py-12 text-white md:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 min-[1440px]:max-w-[80vw] md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <Logo light />
            <p className="mt-4 text-[15px] text-night-muted">Built in Uyo, Nigeria. Christian-first, open to any organization.</p>
          </div>
          <nav className="grid grid-cols-2 gap-x-10 gap-y-3 text-[15px] sm:grid-cols-3" aria-label="Footer">
            <a href="#how-it-works" className="text-night-muted hover:text-white">
              How it works
            </a>
            <a href="#features" className="text-night-muted hover:text-white">
              Features
            </a>
            <a href="#pricing" className="text-night-muted hover:text-white">
              Pricing
            </a>
            <a href="#faq" className="text-night-muted hover:text-white">
              FAQ
            </a>
            <Link href="/signin" className="text-night-muted hover:text-white">
              Sign in
            </Link>
            <Link href="/signup" className="text-night-muted hover:text-white">
              Get started
            </Link>
          </nav>
        </div>
        <p className="mx-auto mt-10 max-w-6xl text-[13px] text-night-muted/80 min-[1440px]:max-w-[80vw]">&copy; {new Date().getFullYear()} DaveUp by Airfesters Limited. All rights reserved.</p>
      </footer>
    </div>
  );
}
