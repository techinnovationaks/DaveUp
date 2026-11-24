"use client";
import { use, useState } from "react";
import { PLAN_NAME, naira, type BillingDto, type ChurchPlan, type ChurchStatus, type StaffChurchDetailDto } from "@daveup/shared";
import { fmtDate as fmtLongDate, planTitle, standing } from "@/components/console/billing";
import { actionLabel, fmtDate, fmtDateTime, planLabel, StaffScreen, statusLabel, statusTone } from "@/components/staff/StaffShell";
import { Button, Card, ErrorText, Field, Loading, Pill, TopBar, inputClass } from "@/components/ui";
import { api, useAction, useApi } from "@/lib/api";
import { formatPhone } from "@/lib/labels";
import { useStaffGuard } from "@/lib/session";

export default function StaffChurch({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { ready } = useStaffGuard();
  const church = useApi<StaffChurchDetailDto>(ready ? `/staff/churches/${id}` : null);
  const billing = useApi<BillingDto>(ready ? `/staff/churches/${id}/billing` : null);
  const [plan, setPlanChoice] = useState<ChurchPlan | null>(null);
  const [blocks, setBlocks] = useState(0);
  const [until, setUntil] = useState("");
  const [note, setNote] = useState("");
  const { busy, error, run } = useAction();
  const [suspending, setSuspending] = useState(false);
  const [reason, setReason] = useState("");

  if (!ready || church.loading) return <Loading />;
  const c = church.data;
  if (!c) {
    return (
      <StaffScreen title="Organization">
        <TopBar back="/staff/churches" />
        <ErrorText>{church.error?.message ?? "Organization not found"}</ErrorText>
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
  const savePlan = () =>
    run(async () => {
      billing.setData(await api<BillingDto>(`/staff/churches/${id}/plan`, { method: "POST", body: { plan: plan ?? c.plan, extraBlocks: blocks, until, note } }));
      setPlanChoice(null);
      await church.reload();
    });
  const b = billing.data;
  const paidOnline = b && (b.status === "active" || b.status === "canceling" || b.status === "grace");

  return (
    <StaffScreen title="Organization">
      <TopBar back="/staff/churches" title="Organization" />
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
              {c.status === "verified" ? `Verified on ${fmtDate(c.verifiedAt!)}.` : c.status === "suspended" ? "Members cannot use DaveUp while the organization is suspended. Nothing is deleted." : "Check that this is a real organization and its administrator is genuine, then verify it."}
            </p>
            <div className="flex flex-col gap-2">
              {c.status !== "verified" && (
                <Button disabled={busy} onClick={() => void setStatus("verified")}>
                  {c.status === "suspended" ? "Reinstate and verify" : "Verify organization"}
                </Button>
              )}
              {c.status === "suspended" && (
                <Button variant="secondary" disabled={busy} onClick={() => void setStatus("unverified")}>
                  Reinstate as unverified
                </Button>
              )}
              {c.status !== "suspended" && !suspending && (
                <Button variant="danger" disabled={busy} onClick={() => setSuspending(true)}>
                  Suspend organization
                </Button>
              )}
            </div>
            {suspending && (
              <div className="mt-4 border-t border-surface-line pt-4">
                <Field label="Reason" hint="Kept in the audit log. The organization's administrators are emailed that access is paused.">
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
            <p className="mb-1 text-[17px] font-bold text-ink">Plan</p>
            {b && (
              <div className="mb-4">
                <p className="text-[15px] font-semibold text-ink">
                  {planTitle(b.plan, b.extraBlocks)} <span className="font-normal text-ink-muted">· {standing(b).pill}</span>
                </p>
                <p className="text-[14px] text-ink-muted">{standing(b).line}</p>
                <p className="mt-1 text-[13px] text-ink-muted">
                  Using {b.usage.disciples} disciples, {b.usage.disciplers} disciplers, {b.usage.cells} cells
                </p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(planLabel) as ChurchPlan[]).map((p) => (
                <button
                  key={p}
                  disabled={busy}
                  onClick={() => setPlanChoice(p)}
                  className={`rounded-xl border px-3 py-2.5 text-[14px] font-semibold ${(plan ?? c.plan) === p ? "border-brand bg-brand-soft text-brand" : "border-surface-line hover:bg-surface"}`}
                >
                  {planLabel[p]}
                </button>
              ))}
            </div>
            {plan && (
              <div className="mt-4">
                <Field label="Extra capacity blocks" hint="Each adds 3 disciplers, 36 disciples and 3 cells.">
                  <input className={inputClass} type="number" min={0} max={1000} value={blocks} onChange={(e) => setBlocks(Math.max(0, Number(e.target.value) || 0))} />
                </Field>
                <Field label="Until (optional)" hint="On this date the organization returns to Basic by itself. Leave empty for no end.">
                  <input className={inputClass} type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
                </Field>
                <Field label="Note (optional)" hint="Shown to the organization, e.g. Pilot or Network agreement.">
                  <input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
                </Field>
                {paidOnline && <p className="mb-3 text-[14px] text-danger">This organization pays online. Setting a plan here stops its renewals.</p>}
                <div className="flex gap-2">
                  <Button disabled={busy} onClick={() => void savePlan()}>
                    Set {PLAN_NAME[plan]}
                  </Button>
                  <Button variant="secondary" onClick={() => setPlanChoice(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
            {b && b.payments.length > 0 && (
              <div className="mt-5 border-t border-surface-line pt-3">
                <p className="mb-1 text-[14px] font-bold text-ink">Payments</p>
                {b.payments.slice(0, 8).map((p) => (
                  <p key={p.id} className="flex justify-between gap-2 py-1 text-[13px] text-ink-muted">
                    <span>
                      {fmtLongDate(p.paidAt ?? p.createdAt)} · {p.status}
                    </span>
                    <span className="font-semibold text-ink">{naira(p.amountKobo)}</span>
                  </p>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </StaffScreen>
  );
}
