"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useSession } from "@/lib/session";
import { BottomNav } from "./BottomNav";
import { IntroSlides } from "./IntroSlides";
import { SITE_IMAGES } from "@/lib/site-images";
import { Icon, accountItem, adminNav, isActive, mainNav, staffNav, titleFor } from "./nav";
import { useRealtime } from "@/lib/realtime";

/** Unread count on the Messages item. */
export function NavBadge({ count, dot = false }: { count: number; dot?: boolean }) {
  if (count <= 0) return null;
  if (dot) return <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-danger ring-2 ring-white lg:hidden" aria-hidden />;
  return (
    <span className="ml-auto min-w-[24px] rounded-full bg-danger px-1.5 py-0.5 text-center text-[12px] font-bold text-white" aria-label={`${count} unread`}>
      {count > 99 ? "99+" : count}
    </span>
  );
}

/** Heart-and-cross mark from the design boards. */
export function Logo({ size = 36, light = false, markOnly = false }: { size?: number; light?: boolean; markOnly?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <span style={{ width: size, height: size }} className={`flex items-center justify-center rounded-xl ${light ? "bg-white" : "bg-brand"}`}>
        <svg width={size * 0.62} height={size * 0.58} viewBox="0 0 24 22" aria-hidden>
          <path d="M12 21s-9-5.6-11-11.2C-.3 5.5 2.7 1 7 1c2.2 0 3.9 1.2 5 2.8C13.1 2.2 14.8 1 17 1c4.3 0 7.3 4.5 6 8.8C21 15.4 12 21 12 21z" fill={light ? "#1E3A8A" : "#fff"} />
          <path d="M12 6v9M8.8 9.4h6.4" stroke={light ? "#fff" : "#1E3A8A"} strokeWidth="2.2" strokeLinecap="round" />
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
 * Phones: a slim bar above the page with the organization, the console (for
 * administrators and DaveUp staff) and your account. Tablet and desktop have
 * these in the side rail.
 */
function MobileTopBar() {
  const { me } = useSession();
  const extra = [...adminNav(me), ...staffNav(me)];
  return (
    <div className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b border-surface-line bg-white/95 px-4 backdrop-blur md:hidden">
      <Logo size={30} markOnly />
      <span className="min-w-0 flex-1 truncate text-[15px] font-bold text-ink">{me?.membership?.churchName ?? "DaveUp"}</span>
      {extra.map((it) => (
        <Link key={it.href} href={it.href} aria-label={it.label} title={it.label} className="flex h-10 w-10 items-center justify-center rounded-full text-ink-muted hover:bg-surface hover:text-brand">
          <Icon size={22}>{it.icon}</Icon>
        </Link>
      ))}
      <Link href="/account" aria-label="Account settings" className="ml-1 flex h-9 w-9 items-center justify-center rounded-full bg-brand-soft text-[14px] font-bold text-brand">
        {initialsOf(me?.person.fullName)}
      </Link>
    </div>
  );
}

/**
 * Left rail. Hidden on mobile, icons only on tablet (768 to 1023),
 * icons with labels on desktop (1024 and up).
 */
function SideRail() {
  const path = usePathname();
  const { me } = useSession();
  const { unread } = useRealtime();
  const items = mainNav();
  const admin = [...adminNav(me), ...staffNav(me)];
  const link = (it: (typeof items)[number]) => {
    const active = isActive(path, it);
    const badge = it.href === "/messages" ? unread : 0;
    return (
      <Link
        key={it.href}
        href={it.href}
        title={it.label}
        aria-current={active ? "page" : undefined}
        className={`relative flex h-[52px] items-center justify-center gap-4 rounded-xl text-[16px] font-semibold transition-colors lg:justify-start lg:px-4 ${
          active ? "bg-brand-soft text-brand" : "text-ink-muted hover:bg-surface hover:text-ink"
        }`}
      >
        <Icon size={22}>{it.icon}</Icon>
        <span className="hidden lg:inline">{it.label}</span>
        <NavBadge count={badge} dot />
        <span className="hidden lg:contents">
          <NavBadge count={badge} />
        </span>
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
        <nav className="mt-8 flex flex-col gap-3 border-t border-surface-line pt-6 lg:border-0 lg:pt-0" aria-label="Organization admin">
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
export function AppShell({ children, nav = false, aside, narrow = false, fill = false }: { children: ReactNode; nav?: boolean; aside?: ReactNode; narrow?: boolean; fill?: boolean }) {
  const path = usePathname();
  if (fill) {
    // Full-height screens (chat): no page padding; the screen scrolls inside itself.
    return (
      <div className="flex h-dvh md:flex">
        <SideRail />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="hidden h-16 shrink-0 items-center border-b border-surface-line bg-white px-8 md:flex">
            <p className="text-[17px] font-bold text-ink">{titleFor(path)}</p>
          </header>
          <main className={`min-h-0 flex-1 ${nav ? "pb-[76px] md:pb-0" : ""}`}>{children}</main>
        </div>
        {nav && <BottomNav />}
      </div>
    );
  }
  return (
    <div className="min-h-dvh md:flex">
      <SideRail />
      <div className="min-w-0 flex-1">
        {nav && <MobileTopBar />}
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

/** Brand panel beside sign-in and onboarding on tablet and desktop. */
/**
 * Photo of people reading together under a navy tint, so white text stays
 * readable over any part of the image. Decorative: empty alt text.
 */
export function AuthPhoto({ priority = false, sizes }: { priority?: boolean; sizes: string }) {
  return (
    <>
      <Image src={SITE_IMAGES.reading.src ?? "/images/home/reading-together.jpg"} alt="" fill priority={priority} sizes={sizes} className="object-cover" />
      <div className="absolute inset-0 bg-gradient-to-br from-brand/90 via-brand-deep/80 to-brand-deep/90" aria-hidden />
    </>
  );
}

export function BrandPanel({ className = "" }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden bg-brand-deep text-white ${className}`}>
      <AuthPhoto priority sizes="(min-width: 1024px) calc(100vw - 560px), 50vw" />
      <div className="relative flex h-full flex-col justify-between p-10 lg:p-14">
        <span />
        <IntroSlides onDark />
        <p className="text-[14px] text-white/75">Provided through your organization.</p>
      </div>
    </div>
  );
}

/** Sign-in and onboarding: single column on mobile, form beside the brand panel from 768 up. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh md:grid md:grid-cols-2 lg:grid-cols-[minmax(480px,560px)_1fr]">
      {/* Phones: the same photo as a banner, since the side panel is hidden. */}
      <div className="relative h-36 overflow-hidden bg-brand-deep md:hidden">
        <AuthPhoto priority sizes="100vw" />
        <div className="relative flex h-full items-end px-4 pb-4">
          <Logo light />
        </div>
      </div>
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
