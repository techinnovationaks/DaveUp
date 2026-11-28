"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { ChurchStatus, StaffChurchDto } from "@daveup/shared";
import { fmtDate, planLabel, StaffScreen, statusLabel, statusTone } from "@/components/staff/StaffShell";
import { Card, ErrorText, H1, Loading, Pill, inputClass } from "@/components/ui";
import { useApi } from "@/lib/api";
import { useStaffGuard } from "@/lib/session";

const FILTERS: { key: ChurchStatus | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unverified", label: "Waiting" },
  { key: "verified", label: "Verified" },
  { key: "suspended", label: "Suspended" },
];

export default function StaffChurches() {
  const { ready } = useStaffGuard();
  const [status, setStatus] = useState<ChurchStatus | "all">("all");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get("status");
    if (s === "unverified" || s === "verified" || s === "suspended") setStatus(s);
  }, []);
  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const params = new URLSearchParams();
  if (status !== "all") params.set("status", status);
  if (query) params.set("q", query);
  const list = useApi<StaffChurchDto[]>(ready ? `/staff/churches?${params}` : null);
  if (!ready) return <Loading />;

  return (
    <StaffScreen>
      <H1 sub="Verify new organizations, change plans, and suspend an organization if needed.">Organizations</H1>
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
        <div className="flex gap-1 rounded-xl bg-surface-line/60 p-1">
          {FILTERS.map((f) => (
            <button key={f.key} onClick={() => setStatus(f.key)} className={`rounded-lg px-3 py-2 text-[14px] font-semibold ${status === f.key ? "bg-card text-ink shadow-sm" : "text-ink-muted"}`}>
              {f.label}
            </button>
          ))}
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or city" className={`${inputClass} py-2.5 md:max-w-xs`} aria-label="Search organizations" />
      </div>
      <ErrorText>{list.error?.message}</ErrorText>
      {list.loading ? (
        <Loading />
      ) : (list.data ?? []).length === 0 ? (
        <Card tone="soft">
          <p className="text-[15px]">No organizations match.</p>
        </Card>
      ) : (
        <Card className="!p-0 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-[14px]">
            <thead className="border-b border-surface-line text-[13px] text-ink-muted">
              <tr>
                <th className="px-5 py-3 font-semibold">Organization</th>
                <th className="px-3 py-3 font-semibold">Status</th>
                <th className="px-3 py-3 font-semibold">Plan</th>
                <th className="px-3 py-3 font-semibold">Members</th>
                <th className="px-3 py-3 font-semibold">Cells</th>
                <th className="px-3 py-3 font-semibold">Administrators</th>
                <th className="px-5 py-3 font-semibold">Registered</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-line">
              {list.data!.map((c) => (
                <tr key={c.id} className="hover:bg-surface">
                  <td className="px-5 py-3">
                    <Link href={`/staff/churches/${c.id}`} className="font-bold text-ink hover:text-brand">
                      {c.name}
                    </Link>
                    <span className="block text-ink-muted">{c.city}</span>
                  </td>
                  <td className="px-3 py-3">
                    <Pill tone={statusTone[c.status]}>{statusLabel[c.status]}</Pill>
                  </td>
                  <td className="px-3 py-3">{planLabel[c.plan]}</td>
                  <td className="px-3 py-3">
                    {c.members}
                    {c.pending > 0 && <span className="text-ink-muted"> (+{c.pending} waiting)</span>}
                  </td>
                  <td className="px-3 py-3">{c.cells}</td>
                  <td className="px-3 py-3 text-ink-muted">{c.admins.map((a) => a.fullName ?? a.email ?? a.phone).join(", ") || "None"}</td>
                  <td className="px-5 py-3 text-ink-muted">{fmtDate(c.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </StaffScreen>
  );
}
