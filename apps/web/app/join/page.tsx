"use client";
// Join an organization: find it by name or city, or enter its code. Invite
// links and QR codes open this page with ?code=..., filled in for you; people
// who are not signed in yet are asked to sign in or create an account first.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ChurchLookupDto, MeDto, OrganizationSearchDto, Participation } from "@daveup/shared";
import { Button, Card, ErrorText, Field, H1, AuthScreen, Loading, Segmented, TopBar, inputClass } from "@/components/ui";
import { ParticipationPicker } from "@/components/ParticipationPicker";
import { rememberJoinCode } from "@/components/OrgSwitcher";
import { api, useAction } from "@/lib/api";
import { useSession } from "@/lib/session";

type Mode = "search" | "code";
type Chosen = { via: "code"; code: string; org: ChurchLookupDto } | { via: "search"; org: OrganizationSearchDto };

export default function Join() {
  const router = useRouter();
  const { me, loading } = useSession();
  const [mode, setMode] = useState<Mode>("search");
  const [code, setCode] = useState("");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<OrganizationSearchDto[] | null>(null);
  const [chosen, setChosen] = useState<Chosen | null>(null);
  const [participation, setParticipation] = useState<Participation | null>(null);
  const [department, setDepartment] = useState("");
  const [fromLink, setFromLink] = useState(false);
  const { busy, error, setError, run } = useAction();

  const lookup = (c: string) =>
    run(async () => {
      const org = await api<ChurchLookupDto>(`/churches/lookup?code=${encodeURIComponent(c.trim())}`);
      setChosen({ via: "code", code: c.trim(), org });
    });

  // An invite link: fill in the code, and look it up once signed in.
  useEffect(() => {
    if (loading) return;
    const c = new URLSearchParams(window.location.search).get("code")?.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!c) return;
    if (!me) {
      rememberJoinCode(c);
      router.replace("/signup");
      return;
    }
    if (!me.person.fullName) {
      rememberJoinCode(c);
      router.replace("/profile");
      return;
    }
    setMode("code");
    setCode(c);
    setFromLink(true);
    void lookup(c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, me]);

  useEffect(() => {
    if (!loading && !me && !new URLSearchParams(window.location.search).get("code")) router.replace("/signin");
  }, [loading, me, router]);

  if (loading || !me) return <Loading />;

  const back = me.memberships.length > 0 ? "/home" : "/start";

  const search = () =>
    run(async () => {
      setResults(await api<OrganizationSearchDto[]>(`/organizations/search?q=${encodeURIComponent(q.trim())}`));
    });

  const join = () =>
    run(async () => {
      if (!chosen) return;
      const body = { participation, department: department.trim() || undefined };
      if (chosen.via === "code") await api<MeDto>("/churches/join", { method: "POST", body: { ...body, code: chosen.code } });
      else await api<MeDto>(`/organizations/${chosen.org.id}/join`, { method: "POST", body });
      // A full load, so everything starts fresh in the new organization.
      window.location.assign("/pending");
    });

  if (chosen) {
    return (
      <AuthScreen>
        <TopBar back={true} title="Confirm your organization" />
        <Card className="mb-6">
          <p className="text-[14px] text-ink-muted">{fromLink ? "You were invited to join" : "You are joining"}</p>
          <p className="mt-1 text-[20px] font-extrabold text-ink">{chosen.org.name}</p>
          <p className="text-[15px] text-ink-muted">{chosen.org.city}</p>
          <button className="mt-3 text-[14px] font-semibold text-brand" onClick={() => (setChosen(null), setFromLink(false), setError(null))}>
            Not the right organization? Look again
          </button>
        </Card>
        <form onSubmit={(e) => (e.preventDefault(), void join())}>
          <ParticipationPicker value={participation} onChange={setParticipation} />
          <Field label="Department (optional)" hint="For example Media, Ushering, Choir.">
            <input className={inputClass} value={department} onChange={(e) => setDepartment(e.target.value)} />
          </Field>
          <p className="mb-4 text-[14px] text-ink-muted">An administrator of {chosen.org.name} will approve your request. They will see your name, phone number and department.</p>
          <ErrorText>{error}</ErrorText>
          <Button type="submit" disabled={busy || !participation}>
            {busy ? "Sending…" : "Ask to join"}
          </Button>
        </form>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen>
      <TopBar back={back} title="Join an organization" />
      <H1 sub={me.memberships.length ? "You can belong to more than one organization and switch between them." : "Find your church, fellowship or group on DaveUp."}>Join an organization</H1>
      <Segmented<Mode>
        value={mode}
        onChange={(m) => (setMode(m), setError(null))}
        options={[
          { value: "search", label: "Search" },
          { value: "code", label: "I have a code" },
        ]}
      />
      {mode === "search" ? (
        <>
          <form onSubmit={(e) => (e.preventDefault(), void search())} className="mb-4 flex gap-2">
            <input className={inputClass} type="search" placeholder="Organization name or city" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
            <Button type="submit" disabled={busy || q.trim().length < 2} className="shrink-0">
              Search
            </Button>
          </form>
          <ErrorText>{error}</ErrorText>
          {results && results.length === 0 && <p className="py-4 text-center text-[15px] text-ink-muted">No organizations found. Check the spelling, or ask for the organization code.</p>}
          {results && results.length > 0 && (
            <div className="space-y-2">
              {results.map((o) => (
                <button
                  key={o.id}
                  disabled={o.mine}
                  onClick={() => setChosen({ via: "search", org: o })}
                  className="flex w-full items-center gap-3 rounded-2xl border border-surface-line bg-white p-4 text-left hover:border-brand-line disabled:opacity-60"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-[17px] font-bold text-brand">{o.name.slice(0, 1).toUpperCase()}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[16px] font-bold text-ink">{o.name}</span>
                      {o.verified && (
                        <span title="Verified by DaveUp" className="text-brand" aria-label="Verified">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                            <path d="M12 2l2.4 2.1 3.2-.4.9 3.1 2.8 1.6-1.2 3 1.2 3-2.8 1.6-.9 3.1-3.2-.4L12 22l-2.4-2.1-3.2.4-.9-3.1L2.7 15.6l1.2-3-1.2-3 2.8-1.6.9-3.1 3.2.4L12 2zm-1.2 13.6l5.6-5.6-1.4-1.4-4.2 4.2-2-2-1.4 1.4 3.4 3.4z" />
                          </svg>
                        </span>
                      )}
                    </span>
                    <span className="block text-[14px] text-ink-muted">
                      {o.city} · {o.members} {o.members === 1 ? "member" : "members"}
                    </span>
                  </span>
                  <span className="text-[14px] font-semibold text-brand">{o.mine ? "Joined" : "Join"}</span>
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <form onSubmit={(e) => (e.preventDefault(), void lookup(code))}>
          <Field label="Organization code" hint="From your organization's office, a notice, an invite link or a QR code.">
            <input
              className={`${inputClass} uppercase tracking-[0.2em]`}
              autoCapitalize="characters"
              autoComplete="off"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              autoFocus
            />
          </Field>
          <ErrorText>{error}</ErrorText>
          <Button type="submit" disabled={busy || code.length < 4}>
            {busy ? "Checking…" : "Find my organization"}
          </Button>
        </form>
      )}
    </AuthScreen>
  );
}
