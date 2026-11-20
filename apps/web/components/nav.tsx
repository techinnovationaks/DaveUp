"use client";
import type { ReactNode } from "react";
import type { MeDto } from "@daveup/shared";

/** Navigation shared by the mobile bottom bar and the tablet/desktop rail. */
export interface NavItem {
  href: string;
  label: string;
  /** Shorter label for the mobile bottom bar. */
  short: string;
  icon: ReactNode;
  /** Other route prefixes that count as this section. */
  also?: string[];
}

const icons = {
  home: <path d="M12 21s-7-4.4-9.2-9A5.2 5.2 0 0 1 12 6.7 5.2 5.2 0 0 1 21.2 12C19 16.6 12 21 12 21zM12 9v6M9 12h6" />,
  assess: <path d="M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM9 8h6M9 12h6M9 16h3" />,
  church: <path d="M3 21h18M5 21V10l7-5 7 5v11M10 21v-5h4v5" />,
  me: <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0" />,
  chat: <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.9-.9L3 20.5l1.5-4.6A8.4 8.4 0 0 1 3 11.5 8.6 8.6 0 0 1 12 3a8.6 8.6 0 0 1 9 8.5z" />,
  staff: <path d="M12 2l8 3v6c0 5-3.4 9.4-8 11-4.6-1.6-8-6-8-11V5l8-3zM9 12l2 2 4-4" />,
};

export function Icon({ children, size = 24 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

/** Member features: everyone. */
export function mainNav(): NavItem[] {
  return [
    { href: "/home", label: "Discipleship", short: "Home", icon: icons.home, also: ["/relationships", "/disciplers", "/invite", "/discipler-request"] },
    { href: "/assessments", label: "Assessments", short: "Assessments", icon: icons.assess },
    { href: "/messages", label: "Messages & cells", short: "Messages", icon: icons.chat },
  ];
}

/** DaveUp staff (super administrators): the staff console. */
export function staffNav(me: MeDto | null): NavItem[] {
  if (!me?.person.isSuperAdmin) return [];
  return [{ href: "/staff", label: "DaveUp staff", short: "Staff", icon: icons.staff }];
}

export function isAdmin(me: MeDto | null): boolean {
  return !!me?.membership?.isAdmin && me.membership.status === "approved";
}

/** In the member app, administrators get one way back to the Church console. */
export function adminNav(me: MeDto | null): NavItem[] {
  if (!isAdmin(me)) return [];
  return [{ href: "/admin", label: "Church console", short: "Console", icon: icons.church }];
}

/** Mobile bottom bar: one Church tab for admins; Members is reached from the console tabs. */
export function bottomNav(me: MeDto | null): NavItem[] {
  return [...mainNav(), ...adminNav(me), accountItem];
}

export const accountItem: NavItem = { href: "/account", label: "Account settings", short: "Account", icon: icons.me, also: ["/profile"] };

export function isActive(path: string, item: NavItem): boolean {
  return [item.href, ...(item.also ?? [])].some((p) => path === p || path.startsWith(p + "/"));
}

/** Page title for the desktop header, from the route. */
export function titleFor(path: string): string {
  if (path.startsWith("/assessments/")) return "Assessment";
  if (path.startsWith("/assessments")) return "Assessments";
  if (path.startsWith("/relationships")) return "Discipleship";
  if (path.startsWith("/disciplers")) return "Choose a discipler";
  if (path.startsWith("/invite")) return "Invite someone";
  if (path.startsWith("/discipler-request")) return "Discipler status";
  if (path.startsWith("/account")) return "Account settings";
  if (path.startsWith("/messages")) return "Messages & cells";
  return "Discipleship";
}
