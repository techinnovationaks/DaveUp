"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ChurchLookupDto, Participation } from "@daveup/shared";
import { Button, Card, ErrorText, Field, H1, AuthScreen, TopBar, inputClass } from "@/components/ui";
import { ParticipationPicker } from "@/components/ParticipationPicker";
import { api, useAction } from "@/lib/api";
import { useSession } from "@/lib/session";

export default function Join() {
  const router = useRouter();
  const { reload } = useSession();
  const [code, setCode] = useState("");
  const [church, setChurch] = useState<ChurchLookupDto | null>(null);
  const [participation, setParticipation] = useState<Participation | null>(null);
  const [department, setDepartment] = useState("");
  const { busy, error, run } = useAction();

  const lookup = () =>
    run(async () => {
      setChurch(await api<ChurchLookupDto>(`/churches/lookup?code=${encodeURIComponent(code.trim())}`));
    });

  const join = () =>
    run(async () => {
      await api("/churches/join", { method: "POST", body: { code: code.trim(), participation, department: department.trim() || undefined } });
      await reload();
      router.replace("/pending");
    });

  if (!church) {
    return (
      <AuthScreen>
        <TopBar back="/start" title="Join your organization" />
        <form onSubmit={(e) => (e.preventDefault(), void lookup())}>
          <H1 sub="An organization code identifies your organization only. It never gives anyone a leadership role.">Enter your organization code</H1>
          <Field label="Organization code">
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
      </AuthScreen>
    );
  }

  return (
    <AuthScreen>
      <TopBar back={true} title="Confirm your organization" />
      <Card className="mb-6">
        <p className="text-[14px] text-ink-muted">You are joining</p>
        <p className="mt-1 text-[20px] font-extrabold text-ink">{church.name}</p>
        <p className="text-[15px] text-ink-muted">{church.city}</p>
        <button className="mt-3 text-[14px] font-semibold text-brand" onClick={() => setChurch(null)}>
          Not your organization? Change code
        </button>
      </Card>
      <form onSubmit={(e) => (e.preventDefault(), void join())}>
        <ParticipationPicker value={participation} onChange={setParticipation} />
        <Field label="Department (optional)" hint="For example Media, Ushering, Choir.">
          <input className={inputClass} value={department} onChange={(e) => setDepartment(e.target.value)} />
        </Field>
        <p className="mb-4 text-[14px] text-ink-muted">Your organization administrator will approve your request. They will see your name, phone number and department.</p>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={busy || !participation}>
          {busy ? "Sending…" : "Ask to join"}
        </Button>
      </form>
    </AuthScreen>
  );
}
