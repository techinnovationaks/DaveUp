import type { Metadata } from "next";
import Link from "next/link";
import { AREAS } from "@daveup/shared";
import { Logo } from "@/components/Shell";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteImage } from "@/components/site/SiteImage";
import { RevealOnScroll } from "@/components/site/RevealOnScroll";

/** Animation delay for staggered entrances (see globals.css). */
const delay = (ms: number) => ({ "--d": `${ms}ms` }) as React.CSSProperties;

export const metadata: Metadata = {
  title: "DaveUp: discipleship for your church",
  description:
    "Help your church move from attendance to intentional discipleship. A 12-area assessment, a discipler for every disciple, growth plans, meetings and monthly checks, in one simple app.",
};

// ---- Content: only what DaveUp does today, in the product's own words (PRD sections 1 to 8). ----

const STEPS = [
  { n: 1, title: "Connect", text: "A disciple and an approved discipler agree to walk together. Nobody is paired without saying yes." },
  { n: 2, title: "Assess", text: "Each of you answers the same 12-area assessment alone. You see where your views differ, together." },
  { n: 3, title: "Plan and meet", text: "Agree one to three focus areas and a few weekly practices. Meet regularly and keep a one-minute record." },
  { n: 4, title: "Check and grow", text: "A short check every month, the full assessment every third month, and progress described in words." },
];

const FEATURES = [
  { title: "12-area assessment", text: "Sixty practical, behaviour-based questions across twelve areas, from Prayer to Reproducing other disciples. Answered about the last month, from what you can actually point to.", icon: "M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9" },
  { title: "Two perspectives", text: "The disciple answers about themselves; the discipler answers about the disciple. Differences become conversation starters, never verdicts.", icon: "M8 7h12M8 12h12M8 17h12M4 7h.01M4 12h.01M4 17h.01" },
  { title: "Growth plans", text: "Pick focus areas from your results, add weekly practices, tick them off day by day and reflect on the week. Both of you confirm the plan.", icon: "M3 3v18h18M7 15l4-4 3 3 5-6" },
  { title: "Guided meetings", text: "Check in, review last week's commitment, look at the evidence, pray, and agree the next step. A short record keeps the thread.", icon: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" },
  { title: "Monthly checks", text: "Twelve questions a month keep growth in view without the full assessment every time. Nothing is ever locked if a check is late.", icon: "M21 12a9 9 0 1 1-3-6.7M21 4v5h-5" },
  { title: "Private by design", text: "Your answers are yours. Your discipler sees area scores side by side only after you both finish. Your church sees counts, never answers.", icon: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" },
];

const CHURCH_POINTS = [
  "Register your church in minutes and share a church code with your members.",
  "Approve new members and the disciplers who will walk with them.",
  "Suggest pairings; each person still chooses to accept.",
  "See coverage at a glance: who has a discipler and who is still waiting.",
  "Each discipler walks with at most twelve people, so nobody is stretched too thin.",
];

const COMING = ["Cells and small groups", "Departments and serving teams", "Family circles", "Mobile app for Android and iPhone"];

const PRIVACY: [string, string][] = [
  ["Your answers stay yours", "Nobody else can open your answers or evidence, including your discipler and your pastor."],
  ["Revealed together", "Area scores appear side by side only once you have both finished."],
  ["Counts, not names", "Church leaders see coverage and counts. Assessment results never reach them."],
  ["Your church only", "Each church's information is kept separate from every other church."],
  ["You can always leave", "End a relationship or raise a concern at any time."],
];

const FAQ = [
  {
    q: "Does it cost anything?",
    a: "Churches start free. Paid plans with more disciplers and AI assistance will be offered later, and your church will always be told before anything is charged.",
  },
  {
    q: "Who can see my answers?",
    a: "Only you. Your discipler sees your area scores beside theirs once you have both finished, never your individual answers or evidence. Church administrators see counts and roles, never assessment results.",
  },
  {
    q: "Do I need to belong to a church?",
    a: "Yes. DaveUp is provided through your local church. Ask your church office for its church code, or, if you lead a church, register it yourself.",
  },
  {
    q: "How do I sign in?",
    a: "With your email address. We send you a 6-digit code each time, so there is no password to remember. You can also use your phone number.",
  },
  {
    q: "What if I want to stop or change discipler?",
    a: "You can end a relationship or raise a concern at any time. Your discipler cannot stop you, and your own history stays with you.",
  },
  {
    q: "Is the assessment a test I can fail?",
    a: "No. It measures what has actually happened in the last month, not what you know. “No occasion yet” never counts against you, and results are shown as growth areas, not grades.",
  },
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

export default function HomePage() {
  return (
    <div className="bg-white text-ink">
      <SiteHeader />
      <RevealOnScroll />

      <main>
        {/* ---- Hero ---- */}
        <section className="relative flex min-h-[640px] items-end overflow-hidden px-4 pb-20 pt-32 md:min-h-[760px] md:items-center md:px-8 md:pb-24">
          <SiteImage slot="hero" sizes="100vw" priority className="hero-zoom" />
          <div className="absolute inset-0 bg-gradient-to-r from-brand-deep/95 via-brand-deep/75 to-brand/40" aria-hidden />
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-brand-deep/60 to-transparent" aria-hidden />
          <div className="relative mx-auto w-full max-w-6xl min-[1440px]:max-w-[80vw]">
            <div className="max-w-2xl text-white">
              <span style={delay(100)} className="hero-rise mb-6 inline-block rounded-[8px] bg-white/15 px-4 py-1.5 text-[13px] font-extrabold uppercase tracking-widest backdrop-blur">Discipleship for your church</span>
              <h1 style={delay(220)} className="hero-rise text-[42px] font-extrabold leading-[1.05] tracking-tight md:text-[64px]">Walk with someone. Make disciples.</h1>
              <p style={delay(380)} className="hero-rise mt-6 max-w-xl text-[18px] leading-relaxed text-white/90 md:text-[20px]">
                DaveUp helps your church move from attendance to intentional discipleship: one discipler, one clear next step, and growth you can actually see.
              </p>
              <div style={delay(520)} className="hero-rise mt-9 flex flex-col gap-3 sm:flex-row">
                <Link href="/signup" className="rounded-[8px] bg-white px-7 py-4 text-center text-[16px] font-bold text-brand shadow-lg shadow-brand-deep/30 transition-transform hover:-translate-y-0.5 hover:bg-white/90">
                  Get started free
                </Link>
                <a href="#churches" className="rounded-[8px] border border-white/40 px-7 py-4 text-center text-[16px] font-bold text-white hover:bg-white/10">
                  I lead a church
                </a>
              </div>
              <p style={delay(660)} className="hero-rise mt-6 text-[14px] text-white/75">Provided through your local church. Sign in with your email, no password needed.</p>
            </div>
          </div>
        </section>

        {/* ---- The problem ---- */}
        <Section className="bg-white">
          <div className="grid gap-12 md:grid-cols-2 md:items-center">
            <div>
              <Kicker>Why DaveUp</Kicker>
              <Heading>Churches can count attendance. Growth is harder to see.</Heading>
            </div>
            <div data-reveal style={delay(160)} className="space-y-5 text-[17px] leading-relaxed text-ink-muted">
              <p>
                Most churches can report how many people came on Sunday. It is much harder to answer the questions that matter: is this person growing in prayer, obedience and
                service? Are they accepting correction? Are they discipling someone else?
              </p>
              <p>
                DaveUp gives every disciple a discipler, a shared picture of where they are across twelve areas, and a practical next step. It supports the relationship; it
                never replaces it.
              </p>
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
              <Heading>A simple cycle that keeps going.</Heading>
              <p data-reveal style={delay(140)} className="mt-4 text-[17px] text-ink-muted">Discipleship is not a course with a graduation date. DaveUp keeps the next step clear, month after month.</p>
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
            <Heading>Everything a discipleship relationship needs.</Heading>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <div
                key={f.title}
                data-reveal
                style={delay((i % 3) * 110)}
                className="rounded-[8px] border border-surface-line bg-white p-7 transition-[box-shadow,transform,border-color] duration-300 hover:-translate-y-1 hover:border-brand-line hover:shadow-xl"
              >
                <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-[8px] bg-brand-soft text-brand">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d={f.icon} />
                  </svg>
                </span>
                <h3 className="text-[19px] font-bold text-ink">{f.title}</h3>
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
              <Heading light>The same twelve areas for everyone.</Heading>
              <p data-reveal style={delay(140)} className="mt-4 text-[17px] text-white/85">Behaviour you can point to, not words you know. Every area has five practical questions for the disciple, and five for the discipler.</p>
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
          </div>
        </section>

        {/* ---- For churches ---- */}
        <Section id="churches" className="bg-white">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <Kicker>For churches</Kicker>
              <Heading>A church console for pastors and administrators.</Heading>
              <p data-reveal style={delay(140)} className="mt-4 text-[17px] text-ink-muted">See who is being discipled and who still needs someone, without ever seeing private answers.</p>
              <ul className="mt-8 space-y-4">
                {CHURCH_POINTS.map((p, i) => (
                  <li key={p} data-reveal style={delay(180 + i * 80)} className="flex gap-3 text-[16px] text-ink">
                    <Check />
                    {p}
                  </li>
                ))}
              </ul>
              <div data-reveal style={delay(200)} className="mt-10 flex flex-col gap-3 sm:flex-row">
                <Link href="/signup" className="rounded-[8px] bg-brand px-7 py-4 text-center text-[16px] font-bold text-white hover:bg-brand-dark">
                  Register your church
                </Link>
                <Link href="/signin" className="rounded-[8px] border border-surface-line px-7 py-4 text-center text-[16px] font-bold text-ink hover:bg-surface">
                  Sign in
                </Link>
              </div>
              <p className="mt-4 text-[14px] text-ink-muted">Create your account, then choose &ldquo;Register a church&rdquo;. You become its administrator.</p>
            </div>
            <div data-reveal style={delay(160)} className="relative aspect-[4/3] overflow-hidden rounded-[8px] shadow-xl">
              <SiteImage slot="churchTeam" sizes="(min-width: 1024px) 50vw, 100vw" />
            </div>
          </div>
        </Section>

        {/* ---- Privacy ---- */}
        <Section className="bg-surface">
          <div className="grid gap-12 md:grid-cols-2">
            <div>
              <Kicker>Privacy</Kicker>
              <Heading>Built on trust.</Heading>
              <p data-reveal style={delay(140)} className="mt-4 text-[17px] text-ink-muted">Honest answers only come when people feel safe. So privacy is built in, not added on.</p>
            </div>
            <ul className="space-y-5">
              {PRIVACY.map(([t, d], i) => (
                <li key={t} data-reveal style={delay(i * 90)} className="flex gap-3">
                  <Check />
                  <span>
                    <span className="block text-[17px] font-bold text-ink">{t}</span>
                    <span className="block text-[15px] text-ink-muted">{d}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Section>

        {/* ---- Coming next ---- */}
        <Section className="bg-white">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div className="grid grid-cols-2 gap-4">
              <div data-reveal className="relative aspect-[3/4] overflow-hidden rounded-[8px]">
                <SiteImage slot="family" sizes="(min-width: 1024px) 25vw, 50vw" />
              </div>
              <div data-reveal style={delay(160)} className="relative mt-10 aspect-[3/4] overflow-hidden rounded-[8px]">
                <SiteImage slot="appPreview" sizes="(min-width: 1024px) 25vw, 50vw" />
              </div>
            </div>
            <div>
              <Kicker>Coming next</Kicker>
              <Heading>Growing with your church.</Heading>
              <p data-reveal style={delay(140)} className="mt-4 text-[17px] text-ink-muted">Discipleship is where DaveUp starts. Here is what we are building next.</p>
              <ul className="mt-8 grid gap-3 sm:grid-cols-2">
                {COMING.map((c, i) => (
                  <li key={c} data-reveal style={delay(160 + i * 80)} className="rounded-[8px] border border-dashed border-brand-line bg-brand-soft/40 px-4 py-3 text-[15px] font-semibold text-ink">
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
          <SiteImage slot="reading" sizes="100vw" />
          <div className="absolute inset-0 bg-gradient-to-br from-brand/95 to-brand-deep/90" aria-hidden />
          <div className="relative mx-auto max-w-3xl text-center text-white">
            <h2 data-reveal className="text-[34px] font-extrabold leading-tight tracking-tight md:text-[48px]">Take the next step together.</h2>
            <p data-reveal style={delay(120)} className="mx-auto mt-5 max-w-xl text-[18px] text-white/85">Create your account, find your church, and start walking with someone.</p>
            <div data-reveal style={delay(240)} className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
              <Link href="/signup" className="rounded-[8px] bg-white px-8 py-4 text-[16px] font-bold text-brand hover:bg-white/90">
                Get started free
              </Link>
              <Link href="/signin" className="rounded-[8px] border border-white/40 px-8 py-4 text-[16px] font-bold text-white hover:bg-white/10">
                I already have an account
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-surface-line bg-white px-4 py-12 md:px-8">
        <div className="mx-auto flex max-w-6xl min-[1440px]:max-w-[80vw] flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <Logo />
            <p className="mt-4 text-[15px] text-ink-muted">Know where your disciples are, help them take the next step, and watch discipleship multiply.</p>
          </div>
          <nav className="grid grid-cols-2 gap-x-10 gap-y-3 text-[15px] sm:grid-cols-3" aria-label="Footer">
            <a href="#how-it-works" className="text-ink-muted hover:text-brand">How it works</a>
            <a href="#features" className="text-ink-muted hover:text-brand">Features</a>
            <a href="#churches" className="text-ink-muted hover:text-brand">For churches</a>
            <a href="#faq" className="text-ink-muted hover:text-brand">FAQ</a>
            <Link href="/signin" className="text-ink-muted hover:text-brand">Sign in</Link>
            <Link href="/signup" className="text-ink-muted hover:text-brand">Create account</Link>
          </nav>
        </div>
        <p className="mx-auto mt-10 max-w-6xl min-[1440px]:max-w-[80vw] text-[13px] text-ink-faint">&copy; {new Date().getFullYear()} DaveUp. Provided through your local church.</p>
      </footer>
    </div>
  );
}
