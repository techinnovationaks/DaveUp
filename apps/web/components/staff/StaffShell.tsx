"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useSession } from "@/lib/session";
import { useSignOut } from "../ConsoleShell";
import { Icon } from "../nav";
import { Logo } from "../Shell";

/** DaveUp staff console: a separate product for platform staff (design guide: "staff console"). */
const icons = {
  overview: <path d="M3 13h8V3H3v10zM13 21h8V11h-8v10zM3 21h8v-6H3v6zM13 3v6h8V3h-8z" />,
  churches: <path d="M3 21h18M5 21V10l7-5 7 5v11M10 21v-5h4v5" />,
  people: <path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M16 3.5a4 4 0 0 1 0 7.5M18 14a6 6 0 0 1 4 7" />,
  activity: <path d="M22 12h-4l-3 9L9 3l-3 9H2" />,
  back: <path d="M15 18l-6-6 6-6" />,
  signOut: <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />,
};

const NAV = [
  { href: "/staff", label: "Overview", icon: icons.overview },
  { href: "/staff/churches", label: "Churches", icon: icons.churches },
  { href: "/staff/people", label: "People & staff", icon: icons.people },
  { href: "/staff/activity", label: "Activity", icon: icons.activity },
];

const isOn = (path: string, href: string) => path === href || (href !== "/staff" && path.startsWith(href + "/"));

export function StaffScreen({ children, title }: { children: ReactNode; title?: string }) {
  const path = usePathname();
  const { me } = useSession();
  const signOut = useSignOut();
  const item = "flex h-[52px] items-center justify-center gap-4 rounded-xl text-[16px] font-semibold transition-colors lg:justify-start lg:px-4";
  const current = title ?? NAV.find((n) => isOn(path, n.href))?.label ?? "Staff console";
  return (
    <div className="min-h-dvh md:flex">
      <aside className="sticky top-0 hidden h-dvh w-[80px] shrink-0 flex-col bg-brand-deep px-3 py-6 text-white md:flex lg:w-[272px] lg:px-5">
        <Link href="/staff" className="flex justify-center lg:justify-start lg:px-2" aria-label="Staff console">
          <span className="lg:hidden">
            <Logo size={40} markOnly light />
          </span>
          <span className="hidden lg:block">
            <Logo light />
          </span>
        </Link>
        <p className="mt-2 hidden px-2 text-[12px] font-bold uppercase tracking-wider text-white/70 lg:block">DaveUp staff console</p>
        <nav className="mt-10 flex flex-col gap-3" aria-label="Staff console">
          {NAV.map((it) => (
            <Link key={it.href} href={it.href} title={it.label} aria-current={isOn(path, it.href) ? "page" : undefined} className={`${item} ${isOn(path, it.href) ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"}`}>
              <Icon size={22}>{it.icon}</Icon>
              <span className="hidden lg:inline">{it.label}</span>
            </Link>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-2 border-t border-white/15 pt-4">
          {me?.membership?.status === "approved" && (
            <Link href={me.membership.isAdmin ? "/admin" : "/home"} title="Back to my church" className={`${item} h-11 text-[14px] text-white/70 hover:bg-white/10 hover:text-white`}>
              <Icon size={20}>{icons.back}</Icon>
              <span className="hidden lg:inline">Back to my church</span>
            </Link>
          )}
          <button onClick={() => void signOut()} title="Sign out" className={`${item} h-11 text-[14px] text-white/70 hover:bg-white/10 hover:text-white`}>
            <Icon size={20}>{icons.signOut}</Icon>
            <span className="hidden lg:inline">Sign out</span>
          </button>
          <p className="mt-2 hidden truncate px-2 text-[14px] font-semibold lg:block">{me?.person.fullName}</p>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="flex items-center justify-between bg-brand-deep px-4 py-3 text-white md:hidden">
          <span className="flex items-center gap-2">
            <Logo size={28} markOnly light />
            <span className="text-[15px] font-bold">Staff console</span>
          </span>
          {me?.membership?.status === "approved" && (
            <Link href={me.membership.isAdmin ? "/admin" : "/home"} className="text-[13px] font-semibold text-white/80">
              My church
            </Link>
          )}
        </header>
        <header className="sticky top-0 z-10 hidden h-16 items-center border-b border-surface-line bg-white/90 px-8 backdrop-blur md:flex">
          <p className="text-[17px] font-bold text-ink">{current}</p>
        </header>
        <main className="mx-auto w-full max-w-md px-4 pb-28 pt-6 md:max-w-none md:px-8 md:pb-12 md:pt-8 lg:max-w-[80vw]">{children}</main>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-surface-line bg-white/95 backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-md">
          {NAV.map((it) => (
            <Link key={it.href} href={it.href} className={`flex flex-1 flex-col items-center gap-1 pb-4 pt-2.5 text-[12px] font-semibold ${isOn(path, it.href) ? "text-brand" : "text-ink-muted"}`}>
              <span className={`mb-0.5 h-[3px] w-8 rounded-full ${isOn(path, it.href) ? "bg-brand" : "bg-transparent"}`} />
              <Icon size={24}>{it.icon}</Icon>
              {it.label.split(" ")[0]}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}

export const statusTone = { unverified: "amber", verified: "green", suspended: "red" } as const;
export const statusLabel = { unverified: "Waiting for verification", verified: "Verified", suspended: "Suspended" } as const;
export const planLabel = { basic: "Basic", standard: "Standard", pro: "Pro", network: "Network" } as const;
export const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
export const fmtDateTime = (iso: string) => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/** "staff.church_suspended" -> "Suspended the church" */
export function actionLabel(action: string): string {
  const map: Record<string, string> = {
    "staff.church_verified": "Verified the church",
    "staff.church_suspended": "Suspended the church",
    "staff.church_unverified": "Marked the church unverified",
    "staff.church_plan": "Changed the plan",
    "staff.granted": "Gave staff access",
    "staff.revoked": "Removed staff access",
    "cell.created": "Created a cell",
    "cell.archived": "Archived a cell",
    "cell.unarchived": "Reopened a cell",
    "cell.members_added": "Added people to a cell",
    "cell.member_removed": "Removed someone from a cell",
    "cell.left": "Left a cell",
  };
  return map[action] ?? action.replace(/[._]/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}
