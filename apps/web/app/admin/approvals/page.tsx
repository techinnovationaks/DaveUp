"use client";
import type { ApprovalsDto } from "@daveup/shared";
import { Card, ErrorText, Eyebrow, H1, Initials, Loading } from "@/components/ui";
import { ConsoleScreen } from "@/components/ConsoleShell";
import { api, useAction, useApi } from "@/lib/api";
import { useGuard } from "@/lib/session";
import { formatPhone } from "@/lib/labels";

const participationLabel = { grow: "Wants to grow", disciple: "Disciples others", both: "Both" } as const;
const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });

export default function Approvals() {
  const { ready } = useGuard("admin");
  const approvals = useApi<ApprovalsDto>(ready ? "/admin/approvals" : null);
  const { busy, error, run } = useAction();

  if (!ready || approvals.loading) return <Loading />;

  const decide = (path: string) =>
    run(async () => {
      await api(path, { method: "POST", body: {} });
      await approvals.reload();
    });

  const a = approvals.data;
  const members = a?.members ?? [];
  const disciplers = a?.disciplerRequests ?? [];
  const waiting = members.length + disciplers.length;

  return (
    <ConsoleScreen>
      <H1 sub="New members and discipler requests waiting for you. Every decision is logged.">Approvals</H1>
      <ErrorText>{error ?? approvals.error?.message}</ErrorText>

      {waiting === 0 && (
        <Card>
          <p className="text-[15px] text-ink-muted">Nothing is waiting for you.</p>
        </Card>
      )}

      {disciplers.length > 0 && (
        <Section title={`Discipler requests (${disciplers.length})`}>
          <Table head={["Discipler request", "Department", "Asked", "Decision"]}>
            {disciplers.map((d) => (
              <tr key={d.id}>
                <Td>
                  <Person name={d.fullName ?? "Member"} />
                </Td>
                <Td muted>{d.department ?? "No department"}</Td>
                <Td muted>{shortDate(d.requestedAt)}</Td>
                <Td>
                  <Decision disabled={busy} onApprove={() => decide(`/admin/discipler-status/${d.id}/approve`)} onDecline={() => decide(`/admin/discipler-status/${d.id}/reject`)} />
                </Td>
              </tr>
            ))}
          </Table>
          <MobileList>
            {disciplers.map((d) => (
              <div key={d.id} className="py-3">
                <p className="text-[16px] font-bold text-ink">{d.fullName ?? "Member"}</p>
                <p className="text-[14px] text-ink-muted">
                  {d.department ?? "No department"} · asked {shortDate(d.requestedAt)}
                </p>
                <Decision disabled={busy} onApprove={() => decide(`/admin/discipler-status/${d.id}/approve`)} onDecline={() => decide(`/admin/discipler-status/${d.id}/reject`)} />
              </div>
            ))}
          </MobileList>
        </Section>
      )}

      {members.length > 0 && (
        <Section title={`New members (${members.length})`}>
          <Table head={["New member", "Phone", "Department", "How they will use DaveUp", "Decision"]}>
            {members.map((m) => (
              <tr key={m.membershipId}>
                <Td>
                  <Person name={m.fullName ?? "No name yet"} />
                </Td>
                <Td muted>{formatPhone(m.phone)}</Td>
                <Td muted>{m.department ?? "None"}</Td>
                <Td muted>{participationLabel[m.participation]}</Td>
                <Td>
                  <Decision disabled={busy} onApprove={() => decide(`/admin/members/${m.membershipId}/approve`)} onDecline={() => decide(`/admin/members/${m.membershipId}/reject`)} />
                </Td>
              </tr>
            ))}
          </Table>
          <MobileList>
            {members.map((m) => (
              <div key={m.membershipId} className="py-3">
                <p className="text-[16px] font-bold text-ink">{m.fullName ?? "No name yet"}</p>
                <p className="text-[14px] text-ink-muted">
                  {formatPhone(m.phone)}
                  {m.department ? ` · ${m.department}` : ""} · {participationLabel[m.participation]}
                </p>
                <Decision disabled={busy} onApprove={() => decide(`/admin/members/${m.membershipId}/approve`)} onDecline={() => decide(`/admin/members/${m.membershipId}/reject`)} />
              </div>
            ))}
          </MobileList>
        </Section>
      )}

      {waiting > 0 && <p className="mt-2 text-[14px] text-ink-muted">Every decision is logged.</p>}
    </ConsoleScreen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="mb-4 md:overflow-hidden md:p-0">
      <Eyebrow className="mb-2 md:hidden">{title}</Eyebrow>
      {children}
    </Card>
  );
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <table className="hidden w-full text-left md:table">
      <thead>
        <tr className="border-b border-surface-line text-[12px] font-bold uppercase tracking-wider text-ink-muted">
          {head.map((h, i) => (
            <th key={h} className={`px-5 py-3 ${i === head.length - 1 ? "w-[220px]" : ""}`}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-surface-line">{children}</tbody>
    </table>
  );
}

function Td({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return <td className={`px-5 py-3.5 text-[15px] ${muted ? "text-ink-muted" : "text-ink"}`}>{children}</td>;
}

function MobileList({ children }: { children: React.ReactNode }) {
  return <div className="divide-y divide-surface-line md:hidden">{children}</div>;
}

function Person({ name }: { name: string }) {
  return (
    <span className="flex items-center gap-3">
      <Initials name={name} size={36} />
      <span className="font-semibold">{name}</span>
    </span>
  );
}

function Decision({ onApprove, onDecline, disabled }: { onApprove: () => void; onDecline: () => void; disabled?: boolean }) {
  const base = "min-h-[44px] flex-1 rounded-xl px-4 text-[15px] font-bold disabled:opacity-50 md:min-h-[38px] md:flex-none md:text-[14px]";
  return (
    <div className="mt-2 flex gap-2 md:mt-0">
      <button disabled={disabled} onClick={onApprove} className={`${base} bg-brand text-white hover:bg-brand-dark`}>
        Approve
      </button>
      <button disabled={disabled} onClick={onDecline} className={`${base} border border-surface-line bg-white text-ink hover:bg-surface`}>
        Decline
      </button>
    </div>
  );
}
