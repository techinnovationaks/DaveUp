"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { MAX_ACTIVE_DISCIPLES, type ChurchMemberDto } from "@daveup/shared";
import { DisciplerPicker, suggestSummary } from "@/components/console/DisciplerPicker";
import { ConsoleScreen } from "@/components/ConsoleShell";
import { Button, Card, ErrorText, H1, Initials, Loading, Pill, inputClass } from "@/components/ui";
import { useApi } from "@/lib/api";
import { contactOf, formatPhone } from "@/lib/labels";
import { useGuard } from "@/lib/session";

type Filter = "all" | "pending" | "noDiscipler" | "disciplers" | "admins";

const FILTERS: { key: Filter; label: string; test: (m: ChurchMemberDto) => boolean }[] = [
  { key: "all", label: "All", test: () => true },
  { key: "pending", label: "Waiting for approval", test: (m) => m.status === "pending" },
  { key: "noDiscipler", label: "No discipler", test: (m) => m.status === "approved" && !m.discipler },
  { key: "disciplers", label: "Disciplers", test: (m) => m.disciplerStatus === "approved" },
  { key: "admins", label: "Administrators", test: (m) => m.isAdmin },
];

const participationLabel = { grow: "Wants to grow", disciple: "Disciples others", both: "Grows and disciples" } as const;
const joined = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

export default function Members() {
  const { me, ready } = useGuard("admin");
  const list = useApi<ChurchMemberDto[]>(ready ? "/admin/members" : null);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const router = useRouter();
  // Bulk "suggest a discipler" (PRD 34.3): approved members without a discipler.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [picking, setPicking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const selectable = (m: ChurchMemberDto) => m.status === "approved" && !m.discipler;
  // Build a new set; never change the previous one (React may run updaters twice).
  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Overview links here with ?filter=pending etc.
  useEffect(() => {
    const f = new URLSearchParams(window.location.search).get("filter");
    if (f && FILTERS.some((x) => x.key === f)) setFilter(f as Filter);
  }, []);

  const all = list.data ?? [];
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.key, all.filter(f.test).length])) as Record<Filter, number>, [all]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const digits = needle.replace(/\D/g, "");
    const test = FILTERS.find((f) => f.key === filter)!.test;
    return all.filter(
      (m) =>
        test(m) &&
        (!needle ||
          (m.fullName ?? "").toLowerCase().includes(needle) ||
          (m.department ?? "").toLowerCase().includes(needle) ||
          // Matches both 0803… and +234803… forms.
          (digits.length >= 3 && ((m.phone ?? "").includes(digits) || formatPhone(m.phone).replace(/\D/g, "").includes(digits))) ||
          (m.email ?? "").includes(needle)),
    );
  }, [all, filter, q]);

  if (!ready || list.loading) return <Loading />;

  return (
    <ConsoleScreen>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <H1 sub={`${counts.all} ${counts.all === 1 ? "person" : "people"} registered in ${me!.membership!.churchName}. Open someone to change their role or department, or tick members without a discipler to suggest one.`}>Members</H1>
      </div>
      <ErrorText>{list.error?.message}</ErrorText>
      {notice && <p className="mb-4 rounded-xl bg-ok-soft px-4 py-3 text-[14px] text-ok">{notice}</p>}
      {picking && (
        <div className="mb-4">
          <DisciplerPicker
            forPeople={all.filter((m) => selected.has(m.personId)).map((m) => ({ personId: m.personId, fullName: m.fullName }))}
            onDone={(r) => {
              setPicking(false);
              if (r) {
                setNotice(suggestSummary(r));
                setSelected(new Set());
                void list.reload();
              }
            }}
          />
        </div>
      )}
      {selected.size > 0 && !picking && (
        <div className="sticky top-16 z-[5] mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-brand-line bg-brand-soft px-4 py-3">
          <p className="flex-1 text-[15px] font-semibold text-ink">{selected.size} selected</p>
          <Button onClick={() => (setNotice(null), setPicking(true))} className="!min-h-[40px]">
            Suggest a discipler
          </Button>
          <button onClick={() => setSelected(new Set())} className="text-[14px] font-semibold text-ink-muted hover:text-ink">
            Clear
          </button>
        </div>
      )}

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0" role="tablist" aria-label="Filter members">
          {FILTERS.map((f) => {
            const on = filter === f.key;
            return (
              <button
                key={f.key}
                role="tab"
                aria-selected={on}
                onClick={() => setFilter(f.key)}
                className={`flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-[14px] font-semibold transition-colors ${
                  on ? "border-ink bg-ink text-page" : "border-surface-line bg-card text-ink hover:border-ink-faint"
                }`}
              >
                {f.label}
                <span className={`rounded-full px-1.5 text-[12px] ${on ? "bg-white/20" : f.key === "pending" && counts.pending > 0 ? "bg-brand text-on-brand" : "bg-surface text-ink-muted"}`}>{counts[f.key]}</span>
              </button>
            );
          })}
        </div>
        <input className={`${inputClass} lg:max-w-xs`} placeholder="Search by name, email, phone or department" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {shown.length === 0 ? (
        <Card>
          <p className="text-[15px] text-ink-muted">{all.length === 0 ? "No one has joined yet. Share your organization code from the Overview." : "No members match."}</p>
        </Card>
      ) : (
        <>
          {/* Tablet and desktop */}
          <Card className="hidden overflow-x-auto !p-0 md:block">
            <table className="w-full min-w-[860px] text-left">
              <thead>
                <tr className="border-b border-surface-line text-[12px] font-bold uppercase tracking-wider text-ink-muted">
                  <th className="w-10 py-3 pl-5">
                    <span className="sr-only">Select</span>
                  </th>
                  <th className="px-5 py-3">Name</th>
                  <th className="px-5 py-3">Contact</th>
                  <th className="px-5 py-3">Role</th>
                  <th className="px-5 py-3">Department</th>
                  <th className="px-5 py-3">Discipler</th>
                  <th className="px-5 py-3">Disciples</th>
                  <th className="px-5 py-3">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-line">
                {shown.map((m) => (
                  <tr
                    key={m.membershipId}
                    onClick={() => router.push(`/admin/members/${m.membershipId}`)}
                    className={`cursor-pointer ${m.status === "pending" ? "bg-warn-soft/40" : selected.has(m.personId) ? "bg-brand-soft/60" : "hover:bg-surface/60"}`}
                  >
                    <td className="py-3.5 pl-5" onClick={(e) => e.stopPropagation()}>
                      {selectable(m) && (
                        <input
                          type="checkbox"
                          aria-label={`Select ${m.fullName ?? "member"}`}
                          className="h-5 w-5 accent-brand"
                          checked={selected.has(m.personId)}
                          onChange={() => toggle(m.personId)}
                        />
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="flex items-center gap-3">
                        <Initials name={m.fullName ?? ""} size={36} />
                        <span className="min-w-0">
                          <span className="block truncate text-[15px] font-semibold text-ink">
                            {m.fullName ?? "No name yet"}
                            {m.personId === me!.person.id && <span className="ml-1.5 text-[13px] font-normal text-ink-muted">(you)</span>}
                          </span>
                          <span className="block truncate text-[13px] text-ink-muted">{participationLabel[m.participation]}</span>
                        </span>
                      </span>
                    </td>
                    <td className="max-w-[220px] truncate whitespace-nowrap px-5 py-3.5 text-[15px] text-ink-muted">{contactOf(m)}</td>
                    <td className="px-5 py-3.5">
                      <Roles m={m} />
                    </td>
                    <td className="px-5 py-3.5 text-[15px] text-ink-muted">{m.department ?? "None"}</td>
                    <td className="whitespace-nowrap px-5 py-3.5 text-[15px]">{m.discipler ? <span className="text-ink">{m.discipler.fullName}</span> : <span className="text-ink-faint">Not assigned</span>}</td>
                    <td className="px-5 py-3.5 text-[15px] text-ink-muted">{m.disciplerStatus === "approved" ? `${m.disciplesCount} of ${MAX_ACTIVE_DISCIPLES}` : "None"}</td>
                    <td className="whitespace-nowrap px-5 py-3.5 text-[15px] text-ink-muted">{joined(m.joinedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Mobile */}
          <div className="space-y-3 md:hidden">
            {shown.map((m) => (
              <Card key={m.membershipId} className="!p-4">
                <div className="flex items-start gap-3">
                  {selectable(m) && (
                    <input
                      type="checkbox"
                      aria-label={`Select ${m.fullName ?? "member"}`}
                      className="mt-3 h-5 w-5 shrink-0 accent-brand"
                      checked={selected.has(m.personId)}
                      onChange={() => toggle(m.personId)}
                    />
                  )}
                  <Link href={`/admin/members/${m.membershipId}`} className="flex min-w-0 flex-1 items-start gap-3">
                  <Initials name={m.fullName ?? ""} size={44} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[16px] font-bold text-ink">
                      {m.fullName ?? "No name yet"}
                      {m.personId === me!.person.id && <span className="ml-1.5 text-[13px] font-normal text-ink-muted">(you)</span>}
                    </p>
                    <p className="text-[14px] text-ink-muted">
                      {contactOf(m)}
                      {m.department ? ` · ${m.department}` : ""}
                    </p>
                    <div className="mt-2">
                      <Roles m={m} />
                    </div>
                    <p className="mt-2 text-[13px] text-ink-muted">
                      {m.discipler ? `Discipled by ${m.discipler.fullName}` : "No discipler yet"}
                      {m.disciplerStatus === "approved" ? ` · disciples ${m.disciplesCount} of ${MAX_ACTIVE_DISCIPLES}` : ""} · joined {joined(m.joinedAt)}
                    </p>
                  </div>
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {counts.pending > 0 && filter !== "pending" && (
        <p className="mt-4 text-[14px] text-ink-muted">
          {counts.pending} waiting for approval.{" "}
          <Link href="/admin/approvals" className="font-semibold text-brand hover:underline">
            Review approvals
          </Link>
        </p>
      )}
    </ConsoleScreen>
  );
}

function Roles({ m }: { m: ChurchMemberDto }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {m.status === "pending" && <Pill tone="amber">Waiting for approval</Pill>}
      {m.isAdmin && (
        <span className="inline-flex items-center rounded-full bg-ink px-3 py-1 text-[13px] font-semibold text-white">Administrator</span>
      )}
      {m.disciplerStatus === "approved" && <Pill tone="red">Discipler</Pill>}
      {m.disciplerStatus === "requested" && <Pill tone="amber">Discipler requested</Pill>}
      {m.status === "approved" && !m.isAdmin && m.disciplerStatus !== "approved" && <Pill>Member</Pill>}
    </span>
  );
}

