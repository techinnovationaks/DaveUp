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
  journal: <path d="M5 4a2 2 0 0 1 2-2h11v18H7a2 2 0 0 0-2 2V4zM5 20a2 2 0 0 1 2-2h11M9 7h5M9 11h5" />,
  training: <path d="M22 9 12 4 2 9l10 5 10-5zM6 11v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5M22 9v6" />,
  resources: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7zM8 13h8M8 16h5" />,
  book: <path d="M2 5c3-1.5 6-1.5 10 1 4-2.5 7-2.5 10-1v14c-3-1.5-6-1.5-10 1-4-2.5-7-2.5-10-1zM12 6v14" />,
  tools: <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />,
  pen: <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />,
  heart: <path d="M12 21s-7-4.4-9.2-9A5.2 5.2 0 0 1 12 6.7 5.2 5.2 0 0 1 21.2 12C19 16.6 12 21 12 21zM12 9v6M9 12h6" />,
};

export const navIcons = icons;

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
    { href: "/home", label: "Home", short: "Home", icon: icons.heart, also: ["/relationships", "/disciplers", "/invite", "/discipler-request"] },
    { href: "/messages", label: "Spaces", short: "Spaces", icon: icons.chat },
    { href: "/journal", label: "Journal", short: "Journal", icon: icons.pen },
    { href: "/resources", label: "Resources", short: "Resources", icon: icons.book, also: ["/training", "/library"] },
    { href: "/tools", label: "Tools", short: "Tools", icon: icons.tools, also: ["/assessments", "/account", "/profile"] },
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
  return [{ href: "/admin", label: "Organization console", short: "Console", icon: icons.church }];
}

/** Mobile bottom bar: the five sections. Account and the console are in the top bar. */
export function bottomNav(_me: MeDto | null): NavItem[] {
  return mainNav();
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
  if (path.startsWith("/messages")) return "Spaces";
  if (path.startsWith("/journal")) return "Journal";
  if (path.startsWith("/training")) return "Trainings";
  if (path.startsWith("/library")) return "Library";
  if (path.startsWith("/resources")) return "Resources";
  if (path.startsWith("/tools")) return "Tools";
  return "Home";
}
