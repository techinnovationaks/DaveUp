"use client";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MAX_ACTIVE_DISCIPLES, type MemberDetailDto } from "@daveup/shared";
import { ConsoleScreen } from "@/components/ConsoleShell";
import { DisciplerPicker, suggestSummary } from "@/components/console/DisciplerPicker";
import { Button, Card, ErrorText, Eyebrow, Initials, Loading, Pill, inputClass } from "@/components/ui";
import { api, useAction, useApi } from "@/lib/api";
import { fmtDay, formatPhone, historyLabel, statusLabel } from "@/lib/labels";
import { useGuard } from "@/lib/session";

const participationLabel = { grow: "Wants to grow", disciple: "Disciples others", both: "Grows and disciples" } as const;

/** One member in the Church console (PRD 33.9): roles and connections, never private content. */
export default function MemberDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { me, ready } = useGuard("admin");
  const d = useApi<MemberDetailDto>(ready ? `/admin/members/${id}` : null);
  const { busy, error, setError, run } = useAction();
  const [notice, setNotice] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [dept, setDept] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => setDept(d.data?.member.department ?? ""), [d.data?.member.department]);

  if (!ready || d.loading) return <Loading />;
  if (!d.data)
    return (
      <ConsoleScreen narrow>
        <BackLink />
        <ErrorText>{d.error?.message ?? "This member was not found."}</ErrorText>
      </ConsoleScreen>
    );

  const x = d.data;
  const m = x.member;
  const isMe = m.personId === me!.person.id;
  const set = (next: MemberDetailDto) => d.setData(next);
  const act = (fn: () => Promise<void>, msg?: string) => run(async () => (setNotice(null), await fn(), msg && setNotice(msg)));
  const patch = (body: object, msg: string) => act(async () => set(await api<MemberDetailDto>(`/admin/members/${id}`, { method: "PATCH", body })), msg);
  const discipler = (verb: "suspend" | "revoke" | "reinstate", msg: string) =>
    act(async () => (await api(`/admin/discipler-status/${x.disciplerStatusId}/${verb}`, { method: "POST" }), await d.reload()), msg);

  const asDisciple = x.relationships.filter((r) => r.role === "disciple");
  const asDiscipler = x.relationships.filter((r) => r.role === "discipler");
  const openAsDisciple = asDisciple.find((r) => ["requested", "accepted_baseline_pending", "active", "paused"].includes(r.status));
  const currentDisciples = asDiscipler.filter((r) => ["accepted_baseline_pending", "active", "paused"].includes(r.status));

  return (
    <ConsoleScreen>
      <BackLink />
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <Initials name={m.fullName ?? ""} size={64} />
        <div className="min-w-0 flex-1">
          <h1 className="text-[28px] font-extrabold leading-tight text-ink">
            {m.fullName ?? "No name yet"}
            {isMe && <span className="ml-2 text-[16px] font-normal text-ink-muted">(you)</span>}
          </h1>
          <p className="text-[15px] text-ink-muted">
            {formatPhone(m.phone)}
            {m.email ? ` · ${m.email}` : ""}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {m.isAdmin && <span className="inline-flex items-center rounded-full bg-ink px-3 py-1 text-[13px] font-semibold text-white">Administrator</span>}
            {m.disciplerStatus === "approved" && <Pill tone="red">Discipler</Pill>}
            {m.disciplerStatus === "suspended" && <Pill tone="amber">Discipler suspended</Pill>}
            {m.status === "pending" && <Pill tone="amber">Waiting for approval</Pill>}
            {!m.isAdmin && m.disciplerStatus !== "approved" && m.status === "approved" && <Pill>Member</Pill>}
          </div>
        </div>
      </div>

      {notice && <p className="mb-4 rounded-xl bg-ok-soft px-4 py-3 text-[14px] text-ok">{notice}</p>}
      <ErrorText>{error}</ErrorText>

      {m.status === "pending" ? (
        <Card>
          <p className="text-[15px] text-ink">
            {m.fullName ?? "This person"} is waiting for approval.{" "}
            <Link href="/admin/approvals" className="font-semibold text-brand hover:underline">
              Review in Approvals
            </Link>
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <Eyebrow className="mb-3">Details</Eyebrow>
            <label className="mb-1 block text-[14px] font-semibold text-ink" htmlFor="dept">
              Department
            </label>
            <div className="mb-4 flex gap-2">
              <input id="dept" className={`${inputClass} py-2.5`} placeholder="For example Media, Choir" value={dept} maxLength={80} onChange={(e) => (setError(null), setDept(e.target.value))} />
              <Button
                variant="secondary"
                disabled={busy || dept.trim() === (m.department ?? "")}
                onClick={() => patch({ department: dept.trim() || null }, "Department saved.")}
                className="!w-auto !min-w-0 shrink-0"
              >
                Save
              </Button>
            </div>
            <dl className="space-y-2 text-[15px]">
              <div className="flex justify-between gap-3">
                <dt className="text-ink-muted">How they use DaveUp</dt>
                <dd className="text-ink">{participationLabel[m.participation]}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-muted">Joined</dt>
                <dd className="text-ink">{fmtDay(m.joinedAt, true)}</dd>
              </div>
            </dl>
          </Card>

          <Card>
            <Eyebrow className="mb-3">Roles</Eyebrow>
            <div className="mb-4 border-b border-surface-line pb-4">
              <p className="text-[16px] font-semibold text-ink">Administrator</p>
              <p className="mb-3 text-[14px] text-ink-muted">
                {m.isAdmin ? "Can use the Church console: approvals, members and settings." : "Not an administrator."}
                {x.lastAdmin ? " They are the only administrator, so the role cannot be removed." : ""}
              </p>
              <Button
                variant="secondary"
                disabled={busy || (m.isAdmin && x.lastAdmin)}
                onClick={() => patch({ isAdmin: !m.isAdmin }, m.isAdmin ? "Administrator role removed." : "They are now an administrator.")}
              >
                {m.isAdmin ? "Remove administrator role" : "Make administrator"}
              </Button>
            </div>
            <p className="text-[16px] font-semibold text-ink">Discipler</p>
            {m.disciplerStatus === "approved" && (
              <>
                <p className="mb-3 text-[14px] text-ink-muted">
                  Approved. Disciples {m.disciplesCount} of {MAX_ACTIVE_DISCIPLES}. Suspending hides them from the discipler list and stops new disciples; current relationships continue.
                </p>
                <div className="flex flex-col gap-2 md:flex-row md:gap-3">
                  <Button variant="secondary" disabled={busy} onClick={() => discipler("suspend", "Discipler status suspended.")}>
                    Suspend
                  </Button>
                  <Button variant="danger" disabled={busy} onClick={() => discipler("revoke", "Discipler status revoked.")}>
                    Revoke
                  </Button>
                </div>
              </>
            )}
            {m.disciplerStatus === "suspended" && (
              <>
                <p className="mb-3 text-[14px] text-ink-muted">Suspended. Hidden from the discipler list; current relationships continue.</p>
                <div className="flex flex-col gap-2 md:flex-row md:gap-3">
                  <Button disabled={busy} onClick={() => discipler("reinstate", "Discipler status reinstated.")}>
                    Reinstate
                  </Button>
                  <Button variant="danger" disabled={busy} onClick={() => discipler("revoke", "Discipler status revoked.")}>
                    Revoke
                  </Button>
                </div>
              </>
            )}
            {m.disciplerStatus === "requested" && (
              <p className="text-[14px] text-ink-muted">
                Asked for discipler status.{" "}
                <Link href="/admin/approvals" className="font-semibold text-brand hover:underline">
                  Review in Approvals
                </Link>
              </p>
            )}
            {(m.disciplerStatus === null || m.disciplerStatus === "rejected" || m.disciplerStatus === "revoked") && (
              <p className="text-[14px] text-ink-muted">
                {m.disciplerStatus === "revoked" ? "Revoked. " : m.disciplerStatus === "rejected" ? "Declined. " : "Not a discipler. "}
                They can ask for discipler status from the member app.
              </p>
            )}
          </Card>

          <Card className="lg:col-span-2">
            <Eyebrow className="mb-3">Discipleship</Eyebrow>
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <p className="mb-1 text-[16px] font-semibold text-ink">Their discipler</p>
                {openAsDisciple ? (
                  <RelRow r={openAsDisciple} onWithdraw={(rid) => act(async () => (await api(`/admin/relationships/${rid}/withdraw`, { method: "POST" }), await d.reload()), "Suggestion withdrawn.")} busy={busy} />
                ) : (
                  <>
                    <p className="mb-3 text-[14px] text-ink-muted">No discipler yet.</p>
                    {!picking && (
                      <Button variant="secondary" onClick={() => (setNotice(null), setPicking(true))}>
                        Suggest a discipler
                      </Button>
                    )}
                  </>
                )}
              </div>
              <div>
                <p className="mb-1 text-[16px] font-semibold text-ink">People they disciple</p>
                {m.disciplerStatus === "approved" || currentDisciples.length > 0 ? (
                  <>
                    <p className="mb-1 text-[14px] text-ink-muted">
                      {x.placesFilled} of {MAX_ACTIVE_DISCIPLES} places used
                    </p>
                    {asDiscipler
                      .filter((r) => r.status !== "ended" && r.status !== "declined")
                      .map((r) => (
                        <RelRow key={r.id} r={r} onWithdraw={(rid) => act(async () => (await api(`/admin/relationships/${rid}/withdraw`, { method: "POST" }), await d.reload()), "Suggestion withdrawn.")} busy={busy} />
                      ))}
                  </>
                ) : (
                  <p className="text-[14px] text-ink-muted">Not discipling anyone.</p>
                )}
              </div>
            </div>
            {picking && (
              <div className="mt-4">
                <DisciplerPicker
                  forPeople={[{ personId: m.personId, fullName: m.fullName }]}
                  onDone={(r) => {
                    setPicking(false);
                    if (r) {
                      setNotice(suggestSummary(r));
                      void d.reload();
                    }
                  }}
                />
              </div>
            )}
            <p className="mt-4 text-[13px] text-ink-faint">You see who is connected, never assessment answers, plans, reflections or meeting notes.</p>
          </Card>

          <Card>
            <Eyebrow className="mb-2">History</Eyebrow>
            {x.history.length === 0 ? (
              <p className="text-[14px] text-ink-muted">Nothing recorded yet.</p>
            ) : (
              <ul className="divide-y divide-surface-line">
                {x.history.map((h, i) => (
                  <li key={i} className="flex justify-between gap-3 py-2 text-[14px]">
                    <span className="text-ink">
                      {historyLabel(h.action)}
                      {h.actor && <span className="text-ink-muted"> · {h.actor}</span>}
                    </span>
                    <span className="shrink-0 text-ink-muted">{fmtDay(h.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {!isMe && (
            <Card tone="soft">
              <Eyebrow className="mb-1">Remove from the church</Eyebrow>
              <p className="mb-3 text-[14px] text-ink">
                Ends their access to {me!.membership!.churchName}. Open discipleship relationships end and discipler status is revoked. Their account stays, and they can join a church again.
              </p>
              {confirmRemove ? (
                <div className="flex flex-col gap-2 md:flex-row md:gap-3">
                  <Button
                    variant="danger"
                    disabled={busy || (m.isAdmin && x.lastAdmin)}
                    onClick={() => act(async () => (await api(`/admin/members/${id}/remove`, { method: "POST" }), router.replace("/admin/members")))}
                  >
                    Yes, remove {m.fullName?.split(" ")[0] ?? "them"}
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirmRemove(false)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button variant="secondary" onClick={() => setConfirmRemove(true)}>
                  Remove from the church
                </Button>
              )}
            </Card>
          )}
        </div>
      )}
    </ConsoleScreen>
  );
}

function BackLink() {
  return (
    <Link href="/admin/members" className="mb-4 inline-flex items-center gap-1 text-[14px] font-semibold text-ink-muted hover:text-ink">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
        <path d="M15 18l-6-6 6-6" />
      </svg>
      Members
    </Link>
  );
}

function RelRow({ r, onWithdraw, busy }: { r: MemberDetailDto["relationships"][number]; onWithdraw: (id: string) => void; busy: boolean }) {
  const suggestion = r.initiatedBy === "church" && r.status === "requested";
  return (
    <div className="flex flex-wrap items-center gap-3 py-2">
      <Initials name={r.other.fullName} size={36} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold text-ink">{r.other.fullName}</p>
        <p className="text-[13px] text-ink-muted">
          {suggestion ? "Suggested by the church, waiting for both to accept" : statusLabel[r.status]} · since {fmtDay(r.since)}
        </p>
      </div>
      {suggestion && (
        <button disabled={busy} onClick={() => onWithdraw(r.id)} className="rounded-lg px-3 py-1.5 text-[13px] font-semibold text-brand hover:bg-brand-soft">
          Withdraw
        </button>
      )}
    </div>
  );
}
