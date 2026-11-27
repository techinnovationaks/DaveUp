"use client";
// Belonging to several organizations: the switcher, and remembering an invite
// link's code while someone signs in or creates an account.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { MeDto, OrganizationChoiceDto } from "@daveup/shared";
import { api } from "@/lib/api";
import { nextStep } from "@/lib/session";

const JOIN_KEY = "daveup.joinCode";

/** Keep an invite code until the person is signed in. */
export function rememberJoinCode(code: string) {
  try {
    localStorage.setItem(JOIN_KEY, code);
  } catch {}
}

/** Where to go after signing in when an invite link is waiting, or null. Clears it. */
export function takeJoinRedirect(me: MeDto | null): string | null {
  if (!me?.person.fullName) return null;
  try {
    const code = localStorage.getItem(JOIN_KEY);
    if (!code) return null;
    localStorage.removeItem(JOIN_KEY);
    return `/join?code=${encodeURIComponent(code)}`;
  } catch {
    return null;
  }
}

/**
 * Look at another organization. A full page load afterwards, so live updates,
 * unread counts and every screen start fresh in the new organization.
 */
export async function switchOrganization(churchId: string) {
  const me = await api<MeDto>("/me/organization", { method: "POST", body: { churchId } });
  window.location.assign(nextStep(me));
}

const statusNote = (m: OrganizationChoiceDto) => (m.suspended ? "Paused" : m.status === "pending" ? "Waiting for approval" : m.isAdmin ? "Administrator" : null);

/**
 * The current organization's name; tapping it lists the others to switch to,
 * and a way to join another.
 */
export function OrgSwitcher({ me, compact = false, dark = false }: { me: MeDto; compact?: boolean; dark?: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const current = me.membership;
  const name = current?.churchName ?? "DaveUp";
  return (
    <div ref={ref} className="relative min-w-0">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex max-w-full items-center gap-1.5 rounded-xl px-2 py-1.5 text-left ${dark ? "hover:bg-white/10" : "hover:bg-surface"}`}
      >
        <span className="min-w-0">
          <span className={`block truncate font-bold ${compact ? "text-[15px]" : "text-[15px]"} ${dark ? "text-white" : "text-ink"}`}>{name}</span>
          {!compact && current && <span className="block truncate text-[12px] text-ink-muted">{current.churchCity}</span>}
        </span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className={`shrink-0 transition-transform ${open ? "rotate-180" : ""} ${dark ? "text-white/80" : "text-ink-muted"}`} aria-hidden>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div role="menu" className="absolute left-0 top-full z-40 mt-1 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-surface-line bg-white py-1.5 text-ink shadow-xl">
          <p className="px-4 pb-1 pt-2 text-[12px] font-bold uppercase tracking-wider text-ink-faint">Your organizations</p>
          {me.memberships.map((m) => {
            const active = m.churchId === current?.churchId;
            const note = statusNote(m);
            return (
              <button
                key={m.churchId}
                role="menuitemradio"
                aria-checked={active}
                disabled={active || !!busy}
                onClick={() => {
                  setBusy(m.churchId);
                  void switchOrganization(m.churchId).catch(() => setBusy(null));
                }}
                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left ${active ? "bg-brand-soft" : "hover:bg-surface"} disabled:cursor-default`}
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[14px] font-bold ${active ? "bg-brand text-white" : "bg-surface-line text-ink"}`}>{m.churchName.slice(0, 1).toUpperCase()}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{m.churchName}</span>
                  <span className="block truncate text-[12px] text-ink-muted">
                    {m.churchCity}
                    {note ? ` · ${note}` : ""}
                  </span>
                </span>
                {active && <span className="text-[13px] font-bold text-brand">✓</span>}
                {busy === m.churchId && <span className="text-[12px] text-ink-muted">Opening…</span>}
              </button>
            );
          })}
          <div className="my-1 border-t border-surface-line" />
          <Link href="/join" onClick={() => setOpen(false)} className="flex items-center gap-3 px-4 py-2.5 text-[15px] font-semibold text-brand hover:bg-surface">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border-2 border-dashed border-brand-line text-[18px]">+</span>
            Join another organization
          </Link>
        </div>
      )}
    </div>
  );
}
