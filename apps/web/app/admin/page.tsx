"use client";
import Link from "next/link";
import { MAX_ACTIVE_DISCIPLES, type AdminOverviewDto } from "@daveup/shared";
import { ConsoleScreen } from "@/components/ConsoleShell";
import { Card, ErrorText, Eyebrow, H1, Loading } from "@/components/ui";
import { useApi } from "@/lib/api";
import { useGuard } from "@/lib/session";
import { firstName, greeting } from "@/lib/labels";

/** Church console overview: counts and what needs the administrator. No private content. */
export default function Overview() {
  const { me, ready } = useGuard("admin");
  const ov = useApi<AdminOverviewDto>(ready ? "/admin/overview" : null);

  if (!ready || ov.loading) return <Loading />;
  const o = ov.data;

  const attention = o
    ? [
        o.pendingMembers > 0 && { href: "/admin/approvals", text: `${o.pendingMembers} new ${o.pendingMembers === 1 ? "member is" : "members are"} waiting for approval`, urgent: true },
        o.disciplerRequests > 0 && { href: "/admin/approvals", text: `${o.disciplerRequests} ${o.disciplerRequests === 1 ? "person has" : "people have"} asked to become a discipler`, urgent: true },
        o.withoutDiscipler > 0 && { href: "/admin/members?filter=noDiscipler", text: `${o.withoutDiscipler} ${o.withoutDiscipler === 1 ? "member has" : "members have"} no discipler yet`, urgent: false },
        o.disciplers === 0 && o.members > 0 && { href: "/admin/members", text: "No approved disciplers yet. Members cannot start discipleship until someone is approved.", urgent: false },
      ].filter((x): x is { href: string; text: string; urgent: boolean } => !!x)
    : [];

  return (
    <ConsoleScreen>
      <H1 sub="Counts and trends only. Private journals and assessment answers never appear here.">
        {greeting()}, {firstName(me!.person.fullName)}
      </H1>
      <ErrorText>{ov.error?.message}</ErrorText>

      {o && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
            <Stat n={o.members} label="Members" href="/admin/members" />
            <Stat n={o.pendingMembers + o.disciplerRequests} label="Waiting for approval" href="/admin/approvals" alert />
            <Stat n={o.disciplers} label="Approved disciplers" sub={`Up to ${MAX_ACTIVE_DISCIPLES} disciples each`} href="/admin/members?filter=disciplers" />
            <Stat n={o.activeRelationships} label="Active discipleships" sub={o.baselinePending > 0 ? `${o.baselinePending} waiting for baseline` : undefined} />
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
            <Card>
              <Eyebrow className="mb-3">Needs attention</Eyebrow>
              {attention.length === 0 ? (
                <p className="text-[15px] text-ink-muted">Nothing needs you right now.</p>
              ) : (
                <ul className="divide-y divide-surface-line">
                  {attention.map((a) => (
                    <li key={a.text}>
                      <Link href={a.href} className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-3.5 hover:bg-surface">
                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${a.urgent ? "bg-brand" : "bg-warn"}`} />
                        <span className="flex-1 text-[15px] text-ink">{a.text}</span>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M9 18l6-6-6-6" /></svg>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {o.members > 0 && (
                <p className="mt-4 border-t border-surface-line pt-4 text-[14px] text-ink-muted">
                  Discipleship coverage: <span className="font-bold text-ink">{Math.round(((o.members - o.withoutDiscipler) / o.members) * 100)}%</span> of members have a discipler.
                </p>
              )}
            </Card>

            <Card>
              <Eyebrow className="mb-1">Church code</Eyebrow>
              <p className="font-mono text-[30px] font-extrabold tracking-[0.25em] text-ink">{o.church.joinCode}</p>
              <p className="mt-1 text-[14px] text-ink-muted">Share it in your bulletin or announcements. It lets people ask to join; it never grants a role.</p>
              <div className="mt-4 flex items-center gap-2 border-t border-surface-line pt-4 text-[14px]">
                <span className={`h-2 w-2 rounded-full ${o.church.status === "verified" ? "bg-ok" : "bg-warn"}`} />
                <span className="text-ink">{o.church.status === "verified" ? "Verified by DaveUp" : "Waiting for DaveUp verification"}</span>
                <span className="ml-auto capitalize text-ink-muted">{o.church.plan} plan</span>
              </div>
            </Card>
          </div>
        </>
      )}
    </ConsoleScreen>
  );
}

function Stat({ n, label, sub, href, alert }: { n: number; label: string; sub?: string; href?: string; alert?: boolean }) {
  const on = alert && n > 0;
  const body = (
    <>
      <p className={`text-[32px] font-extrabold leading-none ${on ? "text-brand" : "text-ink"}`}>{n}</p>
      <p className="mt-2 text-[14px] font-semibold text-ink">{label}</p>
      {sub && <p className="mt-0.5 text-[13px] text-ink-muted">{sub}</p>}
    </>
  );
  const cls = `block rounded-card border p-5 ${on ? "border-brand-line bg-brand-soft" : "border-surface-line bg-white"} ${href ? "transition-colors hover:border-ink-faint" : ""}`;
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
