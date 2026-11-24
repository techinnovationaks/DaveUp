"use client";
import Link from "next/link";
import type { StaffChurchDto, StaffOverviewDto } from "@daveup/shared";
import { fileSize } from "@/components/chat/kit";
import { fmtDate, StaffScreen } from "@/components/staff/StaffShell";
import { Card, ErrorText, H1, Loading } from "@/components/ui";
import { useApi } from "@/lib/api";
import { useStaffGuard } from "@/lib/session";

function Stat({ label, value, href, tone }: { label: string; value: string | number; href?: string; tone?: "warn" | "danger" }) {
  const body = (
    <Card className={`h-full ${href ? "transition-colors hover:border-brand" : ""}`}>
      <p className="text-[14px] text-ink-muted">{label}</p>
      <p className={`mt-1 text-[30px] font-extrabold ${tone === "warn" ? "text-warn" : tone === "danger" ? "text-danger" : "text-ink"}`}>{value}</p>
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default function StaffOverview() {
  const { me, ready } = useStaffGuard();
  const ov = useApi<StaffOverviewDto>(ready ? "/staff/overview" : null);
  const waiting = useApi<StaffChurchDto[]>(ready ? "/staff/churches?status=unverified" : null);
  if (!ready) return <Loading />;
  const o = ov.data;
  return (
    <StaffScreen>
      <H1 sub="Every organization on DaveUp. Staff see who belongs where and how much DaveUp is used, never messages, files or assessment answers.">Welcome, {me?.person.fullName?.split(" ")[0]}</H1>
      <ErrorText>{ov.error?.message}</ErrorText>
      {!o ? (
        <Loading />
      ) : (
        <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Organizations" value={o.churches.total} href="/staff/churches" />
          <Stat label="Waiting for verification" value={o.churches.unverified} href="/staff/churches?status=unverified" tone={o.churches.unverified ? "warn" : undefined} />
          <Stat label="Suspended" value={o.churches.suspended} href="/staff/churches?status=suspended" tone={o.churches.suspended ? "danger" : undefined} />
          <Stat label="People signed up" value={o.people} href="/staff/people" />
          <Stat label="Approved members" value={o.approvedMembers} />
          <Stat label="Members waiting for approval" value={o.pendingMembers} />
          <Stat label="Active cells" value={o.cells} />
          <Stat label="Messages, last 7 days" value={o.messagesLast7Days} />
          <Stat label="Calls, last 7 days" value={o.callsLast7Days} />
          <Stat label="Files stored" value={fileSize(o.filesStoredBytes)} />
        </div>
      )}

      <h2 className="mb-3 text-[20px] font-extrabold text-ink">Waiting for verification</h2>
      {waiting.loading ? (
        <Loading />
      ) : (waiting.data ?? []).length === 0 ? (
        <Card tone="soft">
          <p className="text-[15px] text-ink">No organizations are waiting. New registrations will appear here.</p>
        </Card>
      ) : (
        <Card className="!p-0">
          <ul className="divide-y divide-surface-line">
            {waiting.data!.map((c) => (
              <li key={c.id}>
                <Link href={`/staff/churches/${c.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-surface">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] font-bold text-ink">{c.name}</span>
                    <span className="block truncate text-[14px] text-ink-muted">
                      {c.city} · registered {fmtDate(c.createdAt)} · {c.members} members
                    </span>
                  </span>
                  <span className="text-[14px] font-bold text-brand">Review →</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </StaffScreen>
  );
}
