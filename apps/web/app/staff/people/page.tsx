"use client";
import { useEffect, useState } from "react";
import type { StaffPersonDto } from "@daveup/shared";
import { fmtDate, StaffScreen } from "@/components/staff/StaffShell";
import { Button, Card, ErrorText, H1, Initials, Loading, Pill, inputClass } from "@/components/ui";
import { api, useAction, useApi } from "@/lib/api";
import { formatPhone } from "@/lib/labels";
import { useStaffGuard } from "@/lib/session";

function PersonRow({ p, meId, busy, onToggle }: { p: StaffPersonDto; meId: string; busy: boolean; onToggle: (p: StaffPersonDto) => void }) {
  return (
    <li className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Initials name={p.fullName ?? p.email ?? "?"} size={40} />
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-[15px] font-bold text-ink">
            {p.fullName ?? "No name yet"}
            {p.isSuperAdmin && <Pill tone="green">Staff</Pill>}
          </p>
          <p className="truncate text-[14px] text-ink-muted">
            {[p.email ? `${p.email}${p.emailVerified ? "" : " (unverified)"}` : null, p.phone ? formatPhone(p.phone) : null].filter(Boolean).join(" · ")}
          </p>
          <p className="text-[13px] text-ink-muted">
            {p.church ? `${p.church.name}${p.church.isAdmin ? " · Administrator" : ""}` : "Not in an organization"} · joined {fmtDate(p.createdAt)}
          </p>
        </div>
      </div>
      {p.personId !== meId &&
        (p.superAdminFromConfig ? (
          <span className="text-[13px] text-ink-muted">Staff through server settings</span>
        ) : (
          <Button variant={p.isSuperAdmin ? "danger" : "secondary"} disabled={busy || (!p.isSuperAdmin && !p.emailVerified)} onClick={() => onToggle(p)} className="!min-h-[40px] !text-[14px]">
            {p.isSuperAdmin ? "Remove staff access" : p.emailVerified ? "Make staff" : "Needs a verified email"}
          </Button>
        ))}
    </li>
  );
}

export default function StaffPeople() {
  const { me, ready } = useStaffGuard();
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const people = useApi<StaffPersonDto[]>(ready ? `/staff/people${query ? `?q=${encodeURIComponent(query)}` : ""}` : null);
  const staff = useApi<StaffPersonDto[]>(ready ? "/staff/people?staff=1" : null);
  const { busy, error, run } = useAction();

  if (!ready || !me) return <Loading />;
  const toggle = (p: StaffPersonDto) => {
    if (!confirm(p.isSuperAdmin ? `Remove staff access for ${p.fullName}?` : `Give ${p.fullName} DaveUp staff access? They will be able to verify and suspend any organization.`)) return;
    void run(async () => {
      await api("/staff/super-admins", { method: "POST", body: { personId: p.personId, grant: !p.isSuperAdmin } });
      await Promise.all([people.reload(), staff.reload()]);
    });
  };

  return (
    <StaffScreen>
      <H1 sub="Find anyone on DaveUp, and manage who has staff access.">People & staff</H1>
      <ErrorText>{error}</ErrorText>

      <h2 className="mb-3 text-[18px] font-extrabold text-ink">DaveUp staff</h2>
      <Card className="mb-8 !p-0">
        {staff.loading ? (
          <Loading />
        ) : (
          <ul className="divide-y divide-surface-line">
            {(staff.data ?? []).map((p) => (
              <PersonRow key={p.personId} p={p} meId={me.person.id} busy={busy} onToggle={toggle} />
            ))}
          </ul>
        )}
      </Card>

      <h2 className="mb-3 text-[18px] font-extrabold text-ink">Find a person</h2>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, email or phone" className={`${inputClass} mb-4 md:max-w-sm`} aria-label="Search people" />
      {people.loading ? (
        <Loading />
      ) : (
        <Card className="!p-0">
          {(people.data ?? []).length === 0 ? (
            <p className="p-5 text-[15px] text-ink-muted">Nobody matches.</p>
          ) : (
            <ul className="divide-y divide-surface-line">
              {people.data!.map((p) => (
                <PersonRow key={p.personId} p={p} meId={me.person.id} busy={busy} onToggle={toggle} />
              ))}
            </ul>
          )}
        </Card>
      )}
      {!query && <p className="mt-2 text-[13px] text-ink-muted">Showing the newest 100 sign-ups. Search to find anyone else.</p>}
    </StaffScreen>
  );
}
