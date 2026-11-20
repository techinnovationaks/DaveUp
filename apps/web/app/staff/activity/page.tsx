"use client";
import type { StaffAuditDto } from "@daveup/shared";
import { actionLabel, fmtDateTime, StaffScreen } from "@/components/staff/StaffShell";
import { Card, ErrorText, H1, Loading } from "@/components/ui";
import { useApi } from "@/lib/api";
import { useStaffGuard } from "@/lib/session";

export default function StaffActivity() {
  const { ready } = useStaffGuard();
  const log = useApi<StaffAuditDto[]>(ready ? "/staff/audit" : null);
  if (!ready) return <Loading />;
  return (
    <StaffScreen>
      <H1 sub="Every action taken in the staff console, newest first.">Activity</H1>
      <ErrorText>{log.error?.message}</ErrorText>
      {log.loading ? (
        <Loading />
      ) : (log.data ?? []).length === 0 ? (
        <Card tone="soft">
          <p className="text-[15px]">No staff actions yet.</p>
        </Card>
      ) : (
        <Card className="!p-0">
          <ul className="divide-y divide-surface-line">
            {log.data!.map((a, i) => (
              <li key={i} className="flex flex-col gap-1 px-5 py-3 md:flex-row md:items-baseline md:justify-between">
                <span className="text-[15px] text-ink">
                  <span className="font-semibold">{a.actorName ?? "Staff"}</span> · {actionLabel(a.action)}
                  {a.churchName && <span className="text-ink-muted"> · {a.churchName}</span>}
                  {typeof a.data.reason === "string" && <span className="text-ink-muted"> ({a.data.reason})</span>}
                  {typeof a.data.to === "string" && a.action === "staff.church_plan" && <span className="text-ink-muted"> → {a.data.to}</span>}
                </span>
                <span className="shrink-0 text-[13px] text-ink-muted">{fmtDateTime(a.at)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </StaffScreen>
  );
}
