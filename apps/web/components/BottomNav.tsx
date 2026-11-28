"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "@/lib/session";
import { useRealtime } from "@/lib/realtime";
import { Icon, bottomNav, isActive } from "./nav";

/** Mobile only (under 768px). Tablet and desktop use the side rail. */
export function BottomNav() {
  const path = usePathname();
  const { me } = useSession();
  const { unread } = useRealtime();
  const items = bottomNav(me);
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-surface-line bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <div className="mx-auto flex max-w-md">
        {items.map((it) => {
          const active = isActive(path, it);
          return (
            <Link key={it.href} href={it.href} className={`flex flex-1 flex-col items-center gap-1 pb-4 pt-2.5 text-[12px] font-semibold ${active ? "text-brand" : "text-ink-muted"}`}>
              <span className={`mb-0.5 h-[3px] w-8 rounded-full ${active ? "bg-brand" : "bg-transparent"}`} />
              <span className="relative">
                <Icon size={26}>{it.icon}</Icon>
                {it.href === "/messages" && unread > 0 && (
                  <span className="absolute -right-2.5 -top-1.5 min-w-[20px] rounded-full bg-brand px-1 text-center text-[11px] font-extrabold leading-[20px] text-on-brand ring-2 ring-card">{unread > 99 ? "99+" : unread}</span>
                )}
              </span>
              {it.short}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
