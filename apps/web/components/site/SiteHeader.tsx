"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Logo } from "@/components/Shell";
import { nextStep, useSession } from "@/lib/session";

const LINKS = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#features", label: "Features" },
  { href: "#churches", label: "For churches" },
  { href: "#faq", label: "FAQ" },
];

/** Public site header: section links, and sign-in or "Open DaveUp" for people already signed in. */
export function SiteHeader() {
  const { me, loading } = useSession();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const solid = scrolled || open;
  const linkCls = solid ? "text-ink hover:text-brand" : "text-white/90 hover:text-white";

  return (
    <header className={`fixed inset-x-0 top-0 z-30 transition-colors duration-300 ${solid ? "border-b border-surface-line bg-white/95 backdrop-blur" : "bg-transparent"}`}>
      {/* Same width rule as the page sections (padding outside, width inside), so edges line up. */}
      <div className="px-4 md:px-8">
      <div className="mx-auto flex h-16 max-w-6xl min-[1440px]:max-w-[80vw] items-center gap-6 md:h-20">
        <Link href="/" aria-label="DaveUp home" className="shrink-0">
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
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="site-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          className={`ml-auto flex h-11 w-11 items-center justify-center rounded-[8px] md:ml-0 lg:hidden ${solid ? "text-ink" : "text-white"}`}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </div>
      </div>
      {open && (
        <div id="site-menu" className="border-t border-surface-line bg-white px-4 pb-6 pt-2 lg:hidden">
          <nav className="flex flex-col" aria-label="Main">
            {LINKS.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="border-b border-surface-line py-3.5 text-[16px] font-semibold text-ink">
                {l.label}
              </a>
            ))}
          </nav>
          <div className="mt-5 flex flex-col gap-3 md:hidden">
            {!loading && me ? (
              <Link href={nextStep(me)} className="rounded-[8px] bg-brand py-3.5 text-center text-[16px] font-bold text-white">
                Open DaveUp
              </Link>
            ) : (
              <>
                <Link href="/signup" className="rounded-[8px] bg-brand py-3.5 text-center text-[16px] font-bold text-white">
                  Get started
                </Link>
                <Link href="/signin" className="rounded-[8px] border border-surface-line py-3.5 text-center text-[16px] font-semibold text-ink">
                  Sign in
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
