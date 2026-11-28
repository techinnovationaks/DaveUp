"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Icon } from "./nav";
import { Logo } from "./Shell";

/**
 * Church console: a separate product for church administrators (design guide,
 * "Two products on desktop"). It has its own navigation and none of the
 * member app's discipleship screens.
 */
const icons = {
  overview: <path d="M3 13h8V3H3v10zM13 21h8V11h-8v10zM3 21h8v-6H3v6zM13 3v6h8V3h-8z" />,
  approvals: <path d="M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9" />,
  members: <path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M16 3.5a4 4 0 0 1 0 7.5M18 14a6 6 0 0 1 4 7" />,
  settings: <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />,
  cells: <path d="M12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM5 20a7 7 0 0 1 14 0M5.5 10.5a2.5 2.5 0 1 0 0-5M18.5 10.5a2.5 2.5 0 1 0 0-5M1 18a4.5 4.5 0 0 1 3-4.2M23 18a4.5 4.5 0 0 0-3-4.2" />,
  billing: <path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7zM3 10h18M7 15h4" />,
  memberApp: <path d="M12 21s-7-4.4-9.2-9A5.2 5.2 0 0 1 12 6.7 5.2 5.2 0 0 1 21.2 12C19 16.6 12 21 12 21z" />,
  staff: <path d="M12 2l8 3v6c0 5-3.4 9.4-8 11-4.6-1.6-8-6-8-11V5l8-3zM9 12l2 2 4-4" />,
  signOut: <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />,
};

const NAV = [
  { href: "/admin", label: "Overview", icon: icons.overview },
  { href: "/admin/approvals", label: "Approvals", icon: icons.approvals },
  { href: "/admin/members", label: "Members", icon: icons.members },
  { href: "/admin/cells", label: "Cells", icon: icons.cells },
  { href: "/admin/billing", label: "Billing", icon: icons.billing },
  { href: "/admin/settings", label: "Settings", icon: icons.settings },
];

const TITLES: Record<string, string> = { "/admin": "Overview", "/admin/approvals": "Approvals", "/admin/members": "Members", "/admin/cells": "Cells", "/admin/billing": "Plan and billing", "/admin/settings": "Settings" };

function initialsOf(name: string | null | undefined) {
  return (
    (name ?? "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "?"
  );
}

export function useSignOut() {
  const router = useRouter();
  const { reload } = useSession();
  return async () => {
    await api("/auth/logout", { method: "POST" });
    await reload();
    router.replace("/");
  };
}

function ConsoleRail() {
  const path = usePathname();
  const { me } = useSession();
  const signOut = useSignOut();
  const item = "flex h-[52px] items-center justify-center gap-4 rounded-xl text-[16px] font-semibold transition-colors lg:justify-start lg:px-4";

  return (
    <aside className="sticky top-0 hidden h-dvh w-[80px] shrink-0 flex-col border-r border-surface-line bg-card px-3 py-6 md:flex lg:w-[272px] lg:px-5">
      <Link href="/admin" className="flex justify-center lg:justify-start lg:px-2" aria-label="Organization console">
        <span className="lg:hidden">
          <Logo size={40} markOnly />
        </span>
        <span className="hidden lg:block">
          <Logo />
        </span>
      </Link>
      <p className="mt-2 hidden px-2 text-[12px] font-bold uppercase tracking-wider text-brand lg:block">Organization console</p>
      {me?.membership && <p className="hidden truncate px-2 text-[13px] text-ink-muted lg:block">{me.membership.churchName}, {me.membership.churchCity}</p>}

      <nav className="mt-10 flex flex-col gap-3" aria-label="Organization console">
        {NAV.map((it) => {
          const active = path === it.href || (it.href !== "/admin" && path.startsWith(it.href + "/"));
          return (
            <Link key={it.href} href={it.href} title={it.label} aria-current={active ? "page" : undefined} className={`${item} ${active ? "bg-brand-soft text-brand" : "text-ink-muted hover:bg-surface hover:text-ink"}`}>
              <Icon size={22}>{it.icon}</Icon>
              <span className="hidden lg:inline">{it.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-2 border-t border-surface-line pt-4">
        {me?.person.isSuperAdmin && (
          <Link href="/staff" title="DaveUp staff console" className={`${item} h-11 text-[14px] text-ink-muted hover:bg-surface hover:text-ink`}>
            <Icon size={20}>{icons.staff}</Icon>
            <span className="hidden lg:inline">DaveUp staff</span>
          </Link>
        )}
        <Link href="/home" title="Open the member app" className={`${item} h-11 text-[14px] text-ink-muted hover:bg-surface hover:text-ink`}>
          <Icon size={20}>{icons.memberApp}</Icon>
          <span className="hidden lg:inline">Member app</span>
        </Link>
        <button onClick={() => void signOut()} title="Sign out" className={`${item} h-11 text-[14px] text-ink-muted hover:bg-surface hover:text-ink`}>
          <Icon size={20}>{icons.signOut}</Icon>
          <span className="hidden lg:inline">Sign out</span>
        </button>
        <div className="mt-2 flex items-center justify-center gap-3 lg:justify-start lg:px-2">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[14px] font-bold text-brand">{initialsOf(me?.person.fullName)}</span>
          <span className="hidden min-w-0 lg:block">
            <span className="block truncate text-[15px] font-semibold text-ink">{me?.person.fullName}</span>
            <span className="mt-0.5 inline-flex rounded-full bg-brand px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-on-brand">Administrator</span>
          </span>
        </div>
      </div>
    </aside>
  );
}

function ConsoleBottomNav() {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-surface-line bg-page/95 backdrop-blur md:hidden">
      <div className="mx-auto flex max-w-md">
        {NAV.map((it) => {
          const active = path === it.href || (it.href !== "/admin" && path.startsWith(it.href + "/"));
          return (
            <Link key={it.href} href={it.href} className={`flex flex-1 flex-col items-center gap-1 pb-4 pt-2.5 text-[12px] font-semibold ${active ? "text-brand" : "text-ink-muted"}`}>
              <span className={`mb-0.5 h-[3px] w-8 rounded-full ${active ? "bg-brand" : "bg-transparent"}`} />
              <Icon size={24}>{it.icon}</Icon>
              {it.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function ConsoleScreen({ children, narrow = false }: { children: ReactNode; narrow?: boolean }) {
  const path = usePathname();
  const { me } = useSession();
  return (
    <div className="min-h-dvh md:flex">
      <ConsoleRail />
      <div className="min-w-0 flex-1">
        {/* Mobile header: says clearly this is the console, not the member app. */}
        <header className="flex items-center justify-between border-b border-surface-line bg-card px-4 py-3 md:hidden">
          <span className="flex items-center gap-2">
            <Logo size={28} markOnly />
            <span className="text-[15px] font-bold text-ink">Organization console</span>
          </span>
          <span className="rounded-full bg-brand px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-on-brand">Administrator</span>
        </header>
        <header className="sticky top-0 z-10 hidden h-16 items-center justify-between border-b border-surface-line bg-page/90 px-8 backdrop-blur md:flex">
          <p className="text-[17px] font-bold text-ink">{TITLES[path] ?? (path.startsWith("/admin/members/") ? "Member" : path.startsWith("/admin/cells/") ? "Cell" : "Organization console")}</p>
          {me?.membership && <p className="text-[14px] text-ink-muted">{me.membership.churchName}, {me.membership.churchCity}</p>}
        </header>
        <main className={`mx-auto w-full px-4 pb-28 pt-6 md:px-8 md:pb-12 md:pt-8 ${narrow ? "max-w-md md:max-w-2xl" : "max-w-md md:max-w-none lg:max-w-[80vw]"}`}>{children}</main>
      </div>
      <ConsoleBottomNav />
    </div>
  );
}
