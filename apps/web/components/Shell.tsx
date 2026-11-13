"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useSession } from "@/lib/session";
import { BottomNav } from "./BottomNav";
import { Icon, accountItem, adminNav, isActive, mainNav, titleFor } from "./nav";

/** Heart-and-cross mark from the design boards. */
export function Logo({ size = 36, light = false, markOnly = false }: { size?: number; light?: boolean; markOnly?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <span style={{ width: size, height: size }} className={`flex items-center justify-center rounded-xl ${light ? "bg-white" : "bg-brand"}`}>
        <svg width={size * 0.62} height={size * 0.58} viewBox="0 0 24 22" aria-hidden>
          <path d="M12 21s-9-5.6-11-11.2C-.3 5.5 2.7 1 7 1c2.2 0 3.9 1.2 5 2.8C13.1 2.2 14.8 1 17 1c4.3 0 7.3 4.5 6 8.8C21 15.4 12 21 12 21z" fill={light ? "#D71920" : "#fff"} />
          <path d="M12 6v9M8.8 9.4h6.4" stroke={light ? "#fff" : "#D71920"} strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </span>
      {!markOnly && <span className={`text-[20px] font-extrabold tracking-tight ${light ? "text-white" : "text-ink"}`}>DaveUp</span>}
    </span>
  );
}

function initialsOf(name: string | null | undefined) {
  return (name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";
}

/**
 * Left rail. Hidden on mobile, icons only on tablet (768 to 1023),
 * icons with labels on desktop (1024 and up).
 */
function SideRail() {
  const path = usePathname();
  const { me } = useSession();
  const items = mainNav();
  const admin = adminNav(me);
  const link = (it: (typeof items)[number]) => {
    const active = isActive(path, it);
    return (
      <Link
        key={it.href}
        href={it.href}
        title={it.label}
        aria-current={active ? "page" : undefined}
        className={`flex h-[52px] items-center justify-center gap-4 rounded-xl text-[16px] font-semibold transition-colors lg:justify-start lg:px-4 ${
          active ? "bg-brand-soft text-brand" : "text-ink-muted hover:bg-surface hover:text-ink"
        }`}
      >
        <Icon size={22}>{it.icon}</Icon>
        <span className="hidden lg:inline">{it.label}</span>
      </Link>
    );
  };
  const accountActive = isActive(path, accountItem);

  return (
    <aside className="sticky top-0 hidden h-dvh w-[80px] shrink-0 flex-col border-r border-surface-line bg-white px-3 py-6 md:flex lg:w-[272px] lg:px-5">
      <Link href="/home" className="mb-1 flex justify-center lg:justify-start lg:px-2" aria-label="DaveUp home">
        <span className="lg:hidden">
          <Logo size={40} markOnly />
        </span>
        <span className="hidden lg:block">
          <Logo />
        </span>
      </Link>
      {me?.membership && <p className="mt-1 hidden truncate px-2 text-[13px] text-ink-muted lg:block">{me.membership.churchName}, {me.membership.churchCity}</p>}
      <nav className="mt-10 flex flex-col gap-3" aria-label="Main">
        {items.map(link)}
      </nav>
      {admin.length > 0 && (
        <nav className="mt-8 flex flex-col gap-3 border-t border-surface-line pt-6 lg:border-0 lg:pt-0" aria-label="Church admin">
          {admin.map(link)}
        </nav>
      )}
      <Link
        href="/account"
        title="Account settings"
        className={`mt-auto flex items-center justify-center gap-3 rounded-xl p-3 transition-colors lg:justify-start ${accountActive ? "bg-brand-soft" : "hover:bg-surface"}`}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[14px] font-bold text-brand">{initialsOf(me?.person.fullName)}</span>
        <span className="hidden min-w-0 lg:block">
          <span className="block truncate text-[15px] font-semibold text-ink">{me?.person.fullName}</span>
          <span className="block text-[13px] text-ink-muted">Account settings</span>
        </span>
      </Link>
    </aside>
  );
}

/**
 * Signed-in app layout.
 * - `nav`: show the mobile bottom bar (top-level screens only).
 * - `aside`: context column, shown beside the content at 1280 and up.
 * - `narrow`: cap the content for forms and single-task screens.
 */
export function AppShell({ children, nav = false, aside, narrow = false }: { children: ReactNode; nav?: boolean; aside?: ReactNode; narrow?: boolean }) {
  const path = usePathname();
  return (
    <div className="min-h-dvh md:flex">
      <SideRail />
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-10 hidden h-16 items-center border-b border-surface-line bg-white/90 px-8 backdrop-blur md:flex">
          <p className="text-[17px] font-bold text-ink">{titleFor(path)}</p>
        </header>
        <div className={`mx-auto w-full px-4 pt-6 md:px-8 md:pb-12 md:pt-8 ${nav ? "pb-28" : "pb-10"} ${narrow ? "max-w-md md:max-w-2xl" : "max-w-md md:max-w-none lg:max-w-[80vw]"}`}>
          {aside ? (
            <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_300px] xl:gap-8">
              <main className="min-w-0">{children}</main>
              <aside className="hidden xl:block">
                <div className="sticky top-24 space-y-4">{aside}</div>
              </aside>
            </div>
          ) : (
            <main>{children}</main>
          )}
        </div>
      </div>
      {nav && <BottomNav />}
    </div>
  );
}

const STEPS = ["Take the 12-area assessment", "Meet regularly and follow a growth plan", "Grow, then help someone else grow"];

/** Brand panel beside sign-in and onboarding on tablet and desktop. */
export function BrandPanel({ className = "" }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden bg-gradient-to-br from-brand to-[#8E0F14] text-white ${className}`}>
      <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/10" />
      <div className="absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-white/10" />
      <div className="relative flex h-full flex-col justify-between p-10 lg:p-14">
        <span />
        <div className="max-w-md">
          <span className="mb-5 inline-block rounded-full bg-white/15 px-4 py-1.5 text-[13px] font-extrabold uppercase tracking-widest">Discipleship</span>
          <h2 className="text-[40px] font-extrabold leading-[1.08] tracking-tight lg:text-[48px]">Walk with someone. Make disciples.</h2>
          <p className="mt-4 text-[18px] text-white/85">One discipler, one clear next step, together.</p>
          <ol className="mt-8 space-y-4">
            {STEPS.map((t, i) => (
              <li key={t} className="flex items-center gap-3 text-[17px]">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-[15px] font-bold text-brand">{i + 1}</span>
                {t}
              </li>
            ))}
          </ol>
        </div>
        <p className="text-[14px] text-white/75">Provided through your church.</p>
      </div>
    </div>
  );
}

/** Sign-in and onboarding: single column on mobile, form beside the brand panel from 768 up. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh md:grid md:grid-cols-2 lg:grid-cols-[minmax(480px,560px)_1fr]">
      <main className="mx-auto flex w-full max-w-md flex-col px-4 pb-10 pt-6 md:max-w-none md:px-10 md:py-10 lg:px-16">
        <div className="mb-10 hidden md:block">
          <Logo />
        </div>
        <div className="w-full md:my-auto md:max-w-[440px]">{children}</div>
      </main>
      <BrandPanel className="sticky top-0 hidden h-dvh md:block" />
    </div>
  );
}
