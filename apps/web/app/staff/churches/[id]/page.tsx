"use client";
import { use, useState } from "react";
import type { ChurchPlan, ChurchStatus, StaffChurchDetailDto } from "@daveup/shared";
import { actionLabel, fmtDate, fmtDateTime, planLabel, StaffScreen, statusLabel, statusTone } from "@/components/staff/StaffShell";
import { Button, Card, ErrorText, Field, Loading, Pill, TopBar, inputClass } from "@/components/ui";
import { api, useAction, useApi } from "@/lib/api";
import { formatPhone } from "@/lib/labels";
import { useStaffGuard } from "@/lib/session";

export default function StaffChurch({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { ready } = useStaffGuard();
  const church = useApi<StaffChurchDetailDto>(ready ? `/staff/churches/${id}` : null);
  const { busy, error, run } = useAction();
  const [suspending, setSuspending] = useState(false);
  const [reason, setReason] = useState("");

  if (!ready || church.loading) return <Loading />;
  const c = church.data;
  if (!c) {
    return (
      <StaffScreen title="Church">
        <TopBar back="/staff/churches" />
        <ErrorText>{church.error?.message ?? "Church not found"}</ErrorText>
      </StaffScreen>
    );
  }

  const setStatus = (status: ChurchStatus, why?: string) =>
    run(async () => {
      await api(`/staff/churches/${id}/status`, { method: "POST", body: { status, ...(why ? { reason: why } : {}) } });
      setSuspending(false);
      setReason("");
      await church.reload();
    });
  const setPlan = (plan: ChurchPlan) =>
    run(async () => {
      await api(`/staff/churches/${id}/plan`, { method: "POST", body: { plan } });
      await church.reload();
    });

  return (
    <StaffScreen title="Church">
      <TopBar back="/staff/churches" title="Church" />
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-extrabold leading-tight text-ink">{c.name}</h1>
          <p className="text-[15px] text-ink-muted">
            {c.city} · registered {fmtDate(c.createdAt)} · join code <span className="font-mono font-semibold text-ink">{c.joinCode}</span>
          </p>
        </div>
        <Pill tone={statusTone[c.status]}>{statusLabel[c.status]}</Pill>
      </div>
      <ErrorText>{error}</ErrorText>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {[
              ["Members", c.members],
              ["Waiting for approval", c.pending],
              ["Approved disciplers", c.disciplers],
              ["Active discipleships", c.activeRelationships],
              ["Active cells", c.cells],
              ["Messages, last 30 days", c.messagesLast30Days],
            ].map(([label, value]) => (
              <Card key={label as string}>
                <p className="text-[13px] text-ink-muted">{label}</p>
                <p className="mt-1 text-[26px] font-extrabold text-ink">{value}</p>
              </Card>
            ))}
          </div>

          <Card>
            <p className="mb-3 text-[17px] font-bold text-ink">Administrators</p>
            {c.admins.length === 0 ? (
              <p className="text-[15px] text-ink-muted">No administrators.</p>
            ) : (
              <ul className="divide-y divide-surface-line">
                {c.admins.map((a) => (
                  <li key={a.personId} className="py-2.5">
                    <p className="text-[15px] font-semibold text-ink">{a.fullName ?? "No name yet"}</p>
                    <p className="text-[14px] text-ink-muted">{[a.email, a.phone ? formatPhone(a.phone) : null].filter(Boolean).join(" · ")}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <p className="mb-3 text-[17px] font-bold text-ink">Recent activity</p>
            {c.recentActivity.length === 0 ? (
              <p className="text-[15px] text-ink-muted">Nothing yet.</p>
            ) : (
              <ul className="divide-y divide-surface-line">
                {c.recentActivity.map((a, i) => (
                  <li key={i} className="flex items-baseline justify-between gap-3 py-2">
                    <span className="text-[14px] text-ink">
                      <span className="font-semibold">{a.actorName ?? "DaveUp"}</span> · {actionLabel(a.action)}
                      {typeof a.data.reason === "string" && <span className="text-ink-muted"> ({a.data.reason})</span>}
                    </span>
                    <span className="shrink-0 text-[13px] text-ink-muted">{fmtDateTime(a.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <p className="mb-1 text-[17px] font-bold text-ink">Verification</p>
            <p className="mb-4 text-[14px] text-ink-muted">
              {c.status === "verified" ? `Verified on ${fmtDate(c.verifiedAt!)}.` : c.status === "suspended" ? "Members cannot use DaveUp while the church is suspended. Nothing is deleted." : "Check that this is a real church and its administrator is genuine, then verify it."}
            </p>
            <div className="flex flex-col gap-2">
              {c.status !== "verified" && (
                <Button disabled={busy} onClick={() => void setStatus("verified")}>
                  {c.status === "suspended" ? "Reinstate and verify" : "Verify church"}
                </Button>
              )}
              {c.status === "suspended" && (
                <Button variant="secondary" disabled={busy} onClick={() => void setStatus("unverified")}>
                  Reinstate as unverified
                </Button>
              )}
              {c.status !== "suspended" && !suspending && (
                <Button variant="danger" disabled={busy} onClick={() => setSuspending(true)}>
                  Suspend church
                </Button>
              )}
            </div>
            {suspending && (
              <div className="mt-4 border-t border-surface-line pt-4">
                <Field label="Reason" hint="Kept in the audit log. The church's administrators are emailed that access is paused.">
                  <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500} className={inputClass} />
                </Field>
                <div className="flex gap-2">
                  <Button variant="danger" disabled={busy || !reason.trim()} onClick={() => void setStatus("suspended", reason.trim())}>
                    Suspend
                  </Button>
                  <Button variant="secondary" onClick={() => setSuspending(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </Card>

          <Card>
            <p className="mb-3 text-[17px] font-bold text-ink">Plan</p>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(planLabel) as ChurchPlan[]).map((p) => (
                <button
                  key={p}
                  disabled={busy || p === c.plan}
                  onClick={() => void setPlan(p)}
                  className={`rounded-xl border px-3 py-2.5 text-[14px] font-semibold ${p === c.plan ? "border-brand bg-brand-soft text-brand" : "border-surface-line hover:bg-surface"}`}
                >
                  {planLabel[p]}
                </button>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </StaffScreen>
  );
}
