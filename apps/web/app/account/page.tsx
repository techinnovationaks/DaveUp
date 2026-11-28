"use client";
import { useRouter } from "next/navigation";
import { Button, Card, Loading, Row, Screen, TopBar } from "@/components/ui";
import { api, useAction, useApi } from "@/lib/api";
import type { BlockedPersonDto, MeDto } from "@daveup/shared";
import { switchOrganization } from "@/components/OrgSwitcher";

/** Every organization the person belongs to, with a way to switch or join another. */
function Organizations({ me }: { me: MeDto }) {
  return (
    <Card className="mb-4">
      <p className="mb-2 text-[13px] font-bold uppercase tracking-wider text-brand">Your organizations</p>
      <div className="divide-y divide-surface-line">
        {me.memberships.map((o) => {
          const active = o.churchId === me.membership?.churchId;
          return (
            <div key={o.churchId} className="flex items-center gap-3 py-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[16px] font-semibold text-ink">{o.churchName}</span>
                <span className="text-[14px] text-ink-muted">
                  {o.churchCity}
                  {o.status === "pending" ? " · Waiting for approval" : o.isAdmin ? " · Administrator" : ""}
                  {o.suspended ? " · Paused" : ""}
                </span>
              </span>
              {active ? (
                <span className="text-[14px] font-bold text-brand">Open now</span>
              ) : (
                <button onClick={() => void switchOrganization(o.churchId)} className="rounded-xl px-3 py-2 text-[14px] font-semibold text-brand hover:bg-brand-soft">
                  Switch
                </button>
              )}
            </div>
          );
        })}
      </div>
      <a href="/join" className="mt-2 inline-block text-[15px] font-semibold text-brand hover:underline">
        + Join another organization
      </a>
    </Card>
  );
}

/** People I blocked, to unblock. */
function Blocked() {
  const list = useApi<BlockedPersonDto[]>("/blocks");
  const { busy, run } = useAction();
  if (!list.data?.length) return null;
  return (
    <Card className="mb-4">
      <p className="mb-1 text-[13px] font-bold uppercase tracking-wider text-brand">Blocked people</p>
      <p className="mb-2 text-[14px] text-ink-muted">You and they cannot message or call each other, in any organization.</p>
      <div className="divide-y divide-surface-line">
        {list.data.map((b) => (
          <div key={b.personId} className="flex items-center gap-3 py-3">
            <span className="min-w-0 flex-1 truncate text-[16px] font-semibold text-ink">{b.fullName}</span>
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await api(`/blocks/${b.personId}`, { method: "DELETE" });
                  list.setData(list.data!.filter((x) => x.personId !== b.personId));
                })
              }
              className="rounded-xl px-3 py-2 text-[14px] font-semibold text-brand hover:bg-brand-soft"
            >
              Unblock
            </button>
          </div>
        ))}
      </div>
    </Card>
  );
}
import { useGuard, useSession } from "@/lib/session";
import { contactsOf } from "@/lib/labels";
import { NotifyToggle } from "@/components/EmailSettings";

const participationLabel = { grow: "I want to grow", disciple: "I disciple others", both: "Both" } as const;

export default function Account() {
  const router = useRouter();
  const { me, ready } = useGuard();
  const { reload } = useSession();
  const { busy, run } = useAction();

  if (!ready || !me) return <Loading />;
  const m = me.membership!;

  return (
    <Screen nav narrow>
      <TopBar back="/tools" title="Account" />
      <div className="mb-5 flex items-center gap-4">
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand-soft font-display text-[22px] font-extrabold text-ink">
          {(me.person.fullName ?? "?")
            .split(/\s+/)
            .slice(0, 2)
            .map((w) => w[0]?.toUpperCase())
            .join("")}
        </span>
        <div className="min-w-0">
          <p className="truncate font-display text-[28px] font-extrabold leading-tight text-ink">{me.person.fullName}</p>
          <p className="truncate text-[16px] text-ink-muted">{m.churchName}</p>
        </div>
      </div>
      <div className="mb-5 flex flex-wrap gap-2">
        {[m.isAdmin ? "Administrator" : null, me.disciplerStatus === "approved" ? "Discipler" : "Disciple", m.department].filter(Boolean).map((t) => (
          <span key={t as string} className="rounded-xl bg-brand-soft px-3 py-1.5 text-[15px] font-bold text-ink">
            {t}
          </span>
        ))}
      </div>
      <Card className="mb-4">
        <div className="divide-y divide-surface-line">
          <Row href="/profile" title={me.person.fullName} sub={contactsOf(me.person) || "Add an email in your profile"} />
          <Row title={m.churchName} sub={`${m.churchCity}${m.department ? ` · ${m.department}` : ""}${m.isAdmin ? " · Administrator" : ""}`} />
          <Row title="How I use DaveUp" sub={participationLabel[m.participation]} />
          <Row
            href="/discipler-request"
            title="Discipler status"
            sub={me.disciplerStatus === "approved" ? "Approved" : me.disciplerStatus === "requested" ? "Waiting for approval" : "Not a discipler"}
          />
          {me.person.isSuperAdmin && <Row href="/staff" title="DaveUp staff console" sub="Organizations, verification and staff access" />}
        </div>
      </Card>
      <Organizations me={me} />
      <Card className="mb-4">
        <NotifyToggle me={me} />
      </Card>
      <Blocked />
      <Button
        variant="secondary"
        disabled={busy}
        onClick={() =>
          run(async () => {
            await api("/auth/logout", { method: "POST" });
            await reload();
            router.replace("/");
          })
        }
      >
        Sign out
      </Button>
    </Screen>
  );
}
