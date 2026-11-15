"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Logo } from "@/components/Shell";
import { nextStep, useSession } from "@/lib/session";

const LINKS = [
  { href: "#how-it-works", label: "How it works", hint: "The discipleship cycle, step by step", icon: "M21 12a9 9 0 1 1-3-6.7M21 4v5h-5" },
  { href: "#features", label: "Features", hint: "Assessment, plans, meetings and checks", icon: "M4 5h7v7H4zM13 5h7v7h-7zM4 14h7v5H4zM13 14h7v5h-7z" },
  { href: "#churches", label: "For churches", hint: "The console for pastors and administrators", icon: "M3 21h18M5 21V10l7-5 7 5v11M10 21v-5h4v5M12 2v3M10.5 3.5h3" },
  { href: "#faq", label: "FAQ", hint: "Cost, privacy and signing in", icon: "M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z" },
];

/** Public site header: section links, and sign-in or "Open DaveUp" for people already signed in. */
export function SiteHeader() {
  const { me, loading } = useSession();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // While the menu is open: lock page scroll, close on Escape, and close if
  // the window grows to desktop width (where the menu doesn't exist).
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    firstLinkRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const wide = matchMedia("(min-width: 1024px)");
    const onWide = () => wide.matches && setOpen(false);
    document.addEventListener("keydown", onKey);
    wide.addEventListener("change", onWide);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
      wide.removeEventListener("change", onWide);
    };
  }, [open]);

  const close = () => setOpen(false);
  const solid = scrolled || open;
  const linkCls = solid ? "text-ink hover:text-brand" : "text-white/90 hover:text-white";
  const bar = "absolute left-1/2 h-[2px] w-5 -translate-x-1/2 rounded-full bg-current transition-all duration-300 ease-out";

  return (
    <>
      {/* Dims the page behind the open menu; tap to close. */}
      <div
        aria-hidden
        onClick={close}
        className={`fixed inset-0 z-20 bg-brand-deep/50 backdrop-blur-[2px] transition-opacity duration-300 lg:hidden ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
      />

      <header className={`fixed inset-x-0 top-0 z-30 transition-colors duration-300 ${open ? "border-b border-surface-line bg-white" : solid ? "border-b border-surface-line bg-white/95 backdrop-blur" : "border-b border-transparent bg-transparent"}`}>
        {/* Same width rule as the page sections (padding outside, width inside), so edges line up. */}
        <div className="px-4 md:px-8">
          <div className="mx-auto flex h-16 max-w-6xl min-[1440px]:max-w-[80vw] items-center gap-6 md:h-20">
            <Link href="/" aria-label="DaveUp home" className="shrink-0" onClick={close}>
              <Logo light={!solid} />
            </Link>
            <nav className="hidden flex-1 items-center gap-7 lg:flex" aria-label="Main">
              {LINKS.map((l) => (
                <a key={l.href} href={l.href} className={`text-[15px] font-semibold transition-colors ${linkCls}`}>
                  {l.label}
                </a>
              ))}
            </nav>
            <div className="ml-auto hidden items-center gap-3 md:flex">
              {!loading && me ? (
                <Link href={nextStep(me)} className="rounded-[8px] bg-brand px-5 py-2.5 text-[15px] font-bold text-white hover:bg-brand-dark">
                  Open DaveUp
                </Link>
              ) : (
                <>
                  <Link href="/signin" className={`px-3 py-2.5 text-[15px] font-semibold ${linkCls}`}>
                    Sign in
                  </Link>
                  <Link href="/signup" className={`rounded-[8px] px-5 py-2.5 text-[15px] font-bold ${solid ? "bg-brand text-white hover:bg-brand-dark" : "bg-white text-brand hover:bg-white/90"}`}>
                    Get started
                  </Link>
                </>
              )}
            </div>
            <button
              ref={buttonRef}
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-controls="site-menu"
              aria-label={open ? "Close menu" : "Open menu"}
              className={`relative ml-auto h-11 w-11 rounded-[8px] transition-colors md:ml-0 lg:hidden ${solid ? "text-ink hover:bg-surface" : "text-white hover:bg-white/10"}`}
            >
              <span aria-hidden className={`${bar} ${open ? "top-1/2 -translate-y-1/2 rotate-45" : "top-[15px]"}`} />
              <span aria-hidden className={`${bar} top-1/2 -translate-y-1/2 ${open ? "scale-x-0 opacity-0" : ""}`} />
              <span aria-hidden className={`${bar} ${open ? "top-1/2 -translate-y-1/2 -rotate-45" : "bottom-[15px]"}`} />
            </button>
          </div>
        </div>

        {/* The menu panel. Always in the page so it can animate; inert while closed. */}
        <div
          id="site-menu"
          inert={!open}
          className={`absolute inset-x-0 top-full origin-top border-b border-surface-line bg-white shadow-2xl shadow-brand-deep/20 transition-[opacity,transform] duration-300 ease-out lg:hidden ${
            open ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-3 opacity-0"
          }`}
        >
          <div className="mx-auto max-h-[calc(100dvh-4rem)] max-w-6xl overflow-y-auto px-4 pb-6 pt-3 md:max-h-[calc(100dvh-5rem)] md:px-8">
            <p className="px-3 pb-2 pt-1 text-[12px] font-extrabold uppercase tracking-widest text-ink-faint">Explore</p>
            <nav className="grid gap-1 md:grid-cols-2" aria-label="Main">
              {LINKS.map((l, i) => (
                <a
                  key={l.href}
                  ref={i === 0 ? firstLinkRef : undefined}
                  href={l.href}
                  onClick={close}
                  style={{ transitionDelay: open ? `${80 + i * 50}ms` : "0ms" }}
                  className={`group flex items-center gap-4 rounded-[8px] px-3 py-3 outline-none transition-[background-color,opacity,transform] duration-300 hover:bg-surface focus-visible:bg-surface focus-visible:ring-2 focus-visible:ring-brand/40 ${
                    open ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0"
                  }`}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-brand-soft text-brand transition-colors group-hover:bg-brand group-hover:text-white">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d={l.icon} />
                    </svg>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[16px] font-bold text-ink">{l.label}</span>
                    <span className="block truncate text-[14px] text-ink-muted">{l.hint}</span>
                  </span>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5 group-hover:text-brand" aria-hidden>
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </a>
              ))}
            </nav>

            {/* Sign-in actions; on tablets they are already in the header bar. */}
            <div className="mt-4 border-t border-surface-line pt-5 md:hidden">
              {!loading && me ? (
                <Link href={nextStep(me)} onClick={close} className="block rounded-[8px] bg-brand py-3.5 text-center text-[16px] font-bold text-white hover:bg-brand-dark">
                  Open DaveUp
                </Link>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <Link href="/signin" onClick={close} className="rounded-[8px] border border-surface-line py-3.5 text-center text-[16px] font-semibold text-ink hover:bg-surface">
                    Sign in
                  </Link>
                  <Link href="/signup" onClick={close} className="rounded-[8px] bg-brand py-3.5 text-center text-[16px] font-bold text-white hover:bg-brand-dark">
                    Get started
                  </Link>
                </div>
              )}
              <p className="mt-4 text-center text-[13px] text-ink-faint">Provided through your local church.</p>
            </div>
          </div>
        </div>
      </header>
    </>
  );
}
