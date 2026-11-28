"use client";
// The cyan "+" on Home and its sheet of quick actions (N design 196).
import { useState } from "react";
import type { MeDto } from "@daveup/shared";
import { ActionRow, Sheet } from "@/components/ui";

const I = ({ d }: { d: string }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);

export function QuickActions({ me, meetingHref }: { me: MeDto; meetingHref: string | null }) {
  const [open, setOpen] = useState(false);
  const discipler = me.disciplerStatus === "approved";
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Quick actions"
        className="fixed bottom-[92px] right-5 z-20 flex h-16 w-16 items-center justify-center rounded-full bg-brand text-on-brand shadow-[0_12px_30px_-6px_rgba(1,253,255,.55)] transition-transform hover:scale-105 md:bottom-8 md:right-8"
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
      {open && (
        <Sheet title="Quick actions" onClose={() => setOpen(false)}>
          <div className="space-y-3">
            <ActionRow href="/journal/new" icon={<I d="M5 4a2 2 0 0 1 2-2h11v18H7a2 2 0 0 0-2 2V4zM9 7h5" />} title="New journal entry" sub="What did God show you today?" />
            {discipler && <ActionRow href="/invite" icon={<I d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M19 8v6M22 11h-6" />} title="Invite someone to disciple" sub="Start a new line" />}
            {!me.membership || me.memberships.length === 0 ? null : !discipler && <ActionRow href="/disciplers" icon={<I d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8" />} title="Choose a discipler" sub="Someone to walk with you" />}
            {meetingHref && <ActionRow href={meetingHref} icon={<I d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v3" />} title="Save a meeting record" sub="Capture what you covered" />}
            <ActionRow href="/messages" icon={<I d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />} title="New chat" sub="Message anyone in your organization" />
          </div>
        </Sheet>
      )}
    </>
  );
}
