"use client";
import { Suspense, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { AssessmentHubDto, AssessmentSummaryDto } from "@daveup/shared";
import { Button, Card, ErrorText, Eyebrow, H1, Loading, Pill, Row, Screen } from "@/components/ui";
import { api, useAction, useApi } from "@/lib/api";
import { useGuard } from "@/lib/session";
import { dueText } from "@/lib/labels";

export default function AssessmentsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Hub />
    </Suspense>
  );
}

function Hub() {
  const router = useRouter();
  const params = useSearchParams();
  const { ready } = useGuard();
  const hub = useApi<AssessmentHubDto>(ready ? "/assessments" : null);
  const { busy, error, run } = useAction();
  const started = useRef(false);

  const startCheck = (cycleId: string) =>
    run(async () => {
      const a = await api<AssessmentSummaryDto>(`/cycles/${cycleId}/start`, { method: "POST" });
      router.push(`/assessments/${a.id}`);
    });

  const start = (body: { version: "B" } | { version: "A"; relationshipId: string }) =>
    run(async () => {
      const a = await api<AssessmentSummaryDto>("/assessments", { method: "POST", body });
      router.push(`/assessments/${a.id}`);
    });

  // Deep link from Home / relationship: /assessments?start=<relationshipId> opens that Test A.
  const startFor = params.get("start");
  useEffect(() => {
    if (ready && startFor && !started.current) {
      started.current = true;
      void start({ version: "A", relationshipId: startFor });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, startFor]);

  if (!ready || hub.loading) return <Loading />;
  const b = hub.data?.myTestB;

  return (
    <Screen nav aside={<HowItWorks />}>
      <H1 sub="The same 12 areas for everyone. Answer about the last month, from what you can actually point to.">My assessments</H1>
      <ErrorText>{error ?? hub.error?.message}</ErrorText>

      {(hub.data?.checks.length ?? 0) > 0 && (
        <Card tone="soft" className="mb-4">
          <Eyebrow className="mb-1">Due now</Eyebrow>
          <p className="text-[14px] text-ink-muted">Each answers alone; you see the change together once both have finished. Nothing is locked if you are late.</p>
          <div className="divide-y divide-brand-line/60">
            {hub.data!.checks.map((c) => (
              <Row
                key={c.cycleId}
                onClick={() => (c.assessment ? router.push(`/assessments/${c.assessment.id}`) : startCheck(c.cycleId))}
                title={`${c.kind === "full" ? "Full assessment" : "Monthly check"} ${c.role === "self" ? "about me" : `about ${c.person.fullName}`}`}
                sub={`${c.assessment ? `${c.assessment.progress.answered} of ${c.assessment.progress.total} answered` : c.kind === "full" ? "60 questions" : "12 questions, about 4 minutes"} · ${dueText(c.due)}`}
              />
            ))}
          </div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <Eyebrow className="mb-2">About me</Eyebrow>
        <p className="text-[18px] font-bold text-ink">Baseline self-assessment</p>
        <p className="mb-4 mt-1 text-[15px] text-ink-muted">
          {!b && "60 questions across 12 areas. You can stop and continue later."}
          {b?.status === "in_progress" && `${b.progress.answered} of ${b.progress.total} answered, ${b.progress.areasComplete} of 12 areas complete.`}
          {b?.status === "submitted" && `Finished on ${new Date(b.submittedAt!).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}.`}
        </p>
        {b?.status === "submitted" ? (
          <Pill tone="green">Finished</Pill>
        ) : (
          <Button disabled={busy} onClick={() => (b ? router.push(`/assessments/${b.id}`) : start({ version: "B" }))}>
            {b ? "Continue" : "Start"}
          </Button>
        )}
      </Card>

      {(hub.data?.testAsOwed.length ?? 0) > 0 && (
        <Card>
          <Eyebrow className="mb-1">About my disciples</Eyebrow>
          <p className="text-[14px] text-ink-muted">Your view of each person. They answer about themselves separately.</p>
          <div className="divide-y divide-surface-line">
            {hub.data!.testAsOwed.map((t) => (
              <Row
                key={t.relationshipId}
                onClick={() => (t.assessment ? router.push(`/assessments/${t.assessment.id}`) : start({ version: "A", relationshipId: t.relationshipId }))}
                title={t.disciple.fullName}
                sub={t.assessment ? `${t.assessment.progress.answered} of ${t.assessment.progress.total} answered` : "Not started"}
              />
            ))}
          </div>
        </Card>
      )}
      </div>
    </Screen>
  );
}

function HowItWorks() {
  return (
    <Card>
      <Eyebrow className="mb-2">How it works</Eyebrow>
      <ul className="space-y-2 text-[14px] text-ink">
        <li>Everyone takes the same 60 questions across 12 areas, including disciplers.</li>
        <li>After that, a 12-question check each month, and the full 60 every third month.</li>
        <li>You answer about yourself. Your discipler answers about you, on their own.</li>
        <li>Neither of you sees the other&apos;s answers. You see the comparison together once you have both finished.</li>
        <li>You can stop at any time. Your progress is saved.</li>
      </ul>
    </Card>
  );
}
