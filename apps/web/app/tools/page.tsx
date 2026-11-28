"use client";
// Tools: do and manage (N design 30). My growth at the top, then things to do
// and share, then leadership and administration for those who lead.
import Link from "next/link";
import type { ReactNode } from "react";
import type { RelationshipDto, RelationshipProgressDto } from "@daveup/shared";
import { Loading, Screen } from "@/components/ui";
import { useApi } from "@/lib/api";
import { useGuard } from "@/lib/session";
import { deltas } from "@/components/rel/Growth";

const I = ({ d }: { d: string }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);

const P = {
  assess: "M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM9 8h6M9 12h6M9 16h3",
  box: "M3 7h18v13H3zM3 7l3-4h12l3 4M9 11h6",
  ai: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z",
  story: "M3 5h18v14H3zM8 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4M21 15l-5-5L5 19",
  tree: "M6 3v6M18 3v6M6 9a6 6 0 0 0 12 0M12 15v6M9 21h6",
  heart: "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z",
  people: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
  chart: "M3 3v18h18M7 15l4-4 3 3 5-6",
  check: "M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9",
  cells: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8",
  card: "M2 5h20v14H2zM2 10h20",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.8 1.2V21a2 2 0 0 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4a1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 1.6 14H1.5a2 2 0 0 1 0-4h.1A1.7 1.7 0 0 0 3 7a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 7.4 2.1V2a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 2.8 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 19.4 9h.1a2 2 0 0 1 0 4h-.1z",
  user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4",
  lead: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M19 8v6M22 11h-6",
};

function Item({ href, icon, title, sub, soon }: { href?: string; icon: string; title: string; sub: string; soon?: boolean }) {
  const body = (
    <>
      <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${soon ? "bg-surface text-ink-faint" : "bg-brand-soft text-brand"}`}>
        <I d={icon} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-[18px] font-bold text-ink">
          {title}
          {soon && <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-ink-muted">Soon</span>}
        </span>
        <span className="block text-[15px] text-ink-muted">{sub}</span>
      </span>
      {!soon && (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="shrink-0 text-ink-muted" aria-hidden>
          <path d="M9 18l6-6-6-6" />
        </svg>
      )}
    </>
  );
  const cls = "flex items-center gap-4 border-b border-surface-line py-4";
  return href && !soon ? (
    <Link href={href} className={`${cls} hover:bg-surface/40`}>
      {body}
    </Link>
  ) : (
    <div className={`${cls} opacity-75`}>{body}</div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-[14px] font-extrabold tracking-[0.12em] text-ink-muted">{title}</h2>
      <div className="mt-1">{children}</div>
    </section>
  );
}

export default function Tools() {
  const { me, ready } = useGuard("library");
  const rels = useApi<RelationshipDto[]>(ready && me?.membership?.status === "approved" ? "/relationships" : null);
  const mine = (rels.data ?? []).find((r) => r.myRole === "disciple" && r.status === "active");
  const progress = useApi<RelationshipProgressDto>(mine ? `/relationships/${mine.id}/progress` : null);
  if (!ready || !me || rels.loading) return <Loading />;

  const points = progress.data?.points ?? [];
  const s = points.length ? deltas(points).now : null;
  const isAdmin = !!me.membership?.isAdmin && me.membership.status === "approved";
  const isDiscipler = me.disciplerStatus === "approved";
  const leads = isAdmin || isDiscipler || me.person.isSuperAdmin;
  const initials = (me.person.fullName ?? "?")
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

  return (
    <Screen nav>
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <p className="text-[16px] text-ink-muted">Do and manage</p>
          <h1 className="font-display text-[40px] font-extrabold leading-tight tracking-tight text-ink">Tools</h1>
        </div>
        <Link href="/account" aria-label="Account" className="flex h-14 w-14 items-center justify-center rounded-full border-[3px] border-white bg-brand-soft text-[18px] font-extrabold text-ink">
          {initials}
        </Link>
      </div>

      {/* My growth */}
      <div className="rounded-[8px] bg-brand-soft p-6">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[13px] font-extrabold tracking-[0.14em] text-[#9DB8FF]">MY GROWTH</p>
          {mine && (
            <Link href={`/relationships/${mine.id}`} className="text-[16px] font-bold text-[#9DB8FF] hover:text-ink">
              Results
            </Link>
          )}
        </div>
        <div className="mt-1 flex gap-10">
          <div>
            <p className="font-display text-[52px] font-extrabold leading-none text-ink">{s?.faith != null ? `${s.faith}%` : "–"}</p>
            <p className="mt-1 text-[16px] text-ink-muted">Priest</p>
          </div>
          <div>
            <p className="font-display text-[52px] font-extrabold leading-none text-ink">{s?.impact != null ? `${s.impact}%` : "–"}</p>
            <p className="mt-1 text-[16px] text-ink-muted">King</p>
          </div>
        </div>
        {!s && <p className="mt-3 text-[14px] text-ink-muted">Your scores appear once you and your discipler have both finished the 12-area assessment.</p>}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Link href={mine ? `/relationships/${mine.id}#plan` : "/disciplers"} className="rounded-full bg-card py-3.5 text-center text-[16px] font-bold text-brand">
            {mine ? "Growth plan" : "Find a discipler"}
          </Link>
          <Link href="/assessments" className="rounded-full border border-brand-line py-3.5 text-center text-[16px] font-bold text-ink">
            Assessments
          </Link>
        </div>
      </div>

      <Group title="DO AND SHARE">
        <Item href="/assessments" icon={P.assess} title="Assessments" sub="Your checks, and the ones you owe" />
        <Item href="/library" icon={P.box} title="Library" sub="Guides, videos and links from your organization" />
        <Item icon={P.box} title="Resource Center" sub="Give first. Then receive." soon />
        <Item icon={P.ai} title="AI assistant" sub="Prepare, reflect, plan" soon />
        <Item icon={P.story} title="Stories" sub="Live from your circles, and your own" soon />
      </Group>

      {leads && (
        <Group title="LEADERSHIP AND ADMINISTRATION">
          {isDiscipler && <Item href="/home?mode=lead" icon={P.lead} title="My disciples" sub="Who needs you today" />}
          {isAdmin && (
            <>
              <Item href="/admin" icon={P.chart} title="Organization overview" sub="Members, cells and who needs attention" />
              <Item href="/admin/approvals" icon={P.check} title="Approvals" sub="New members and discipler requests" />
              <Item href="/admin/members" icon={P.people} title="Members" sub="Search, roles, remove" />
              <Item href="/admin/cells" icon={P.cells} title="Cells" sub="Groups, leaders and members" />
              <Item href="/admin/billing" icon={P.card} title="Plan and billing" sub="Leaders, members and payments" />
              <Item href="/admin/settings" icon={P.gear} title="Organization settings" sub="Invite link, search listing, profile" />
            </>
          )}
          <Item icon={P.tree} title="Multiplication" sub="Generations and reproducing disciples" soon />
          <Item icon={P.heart} title="Church health" sub="Five questions, one page" soon />
          {me.person.isSuperAdmin && <Item href="/staff" icon={P.shield} title="DaveUp staff" sub="Organizations, verification and staff access" />}
        </Group>
      )}

      <Group title="ACCOUNT">
        <Item href="/account" icon={P.user} title="Account settings" sub="Profile, organizations, notifications, blocked people" />
      </Group>
    </Screen>
  );
}
