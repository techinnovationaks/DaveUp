"use client";
// Training: courses from DaveUp and your organization, with your progress.
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CourseDto, CourseListDto, CourseSummaryDto, LibraryScope } from "@daveup/shared";
import { Screen, Button, Card, ErrorText, Field, H1, Loading, Pill, inputClass } from "@/components/ui";
import { Modal } from "@/components/chat/kit";
import { ScopeBadge, ScopePicker, defaultScope } from "@/components/library/kit";
import { api, useAction, useApi } from "@/lib/api";
import { useGuard } from "@/lib/session";

function Progress({ c }: { c: CourseSummaryDto }) {
  const pct = c.lessonCount ? Math.round((c.completedCount / c.lessonCount) * 100) : 0;
  return (
    <div className="mt-4">
      <div className="mb-1.5 flex justify-between text-[13px] font-semibold text-ink-muted">
        <span>
          {c.lessonCount} {c.lessonCount === 1 ? "lesson" : "lessons"}
        </span>
        <span>{c.completedCount === c.lessonCount && c.lessonCount > 0 ? "Completed" : c.completedCount > 0 ? `${pct}% done` : "Not started"}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-line" role="progressbar" aria-valuenow={pct} aria-valuemax={100} aria-label={`${c.title} progress`}>
        <div className={`h-full rounded-full ${pct === 100 ? "bg-ok" : "bg-brand"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function NewCourse({ list, onClose }: { list: CourseListDto; onClose: () => void }) {
  const router = useRouter();
  const [scope, setScope] = useState<LibraryScope>(defaultScope(list.rights));
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const { busy, error, run } = useAction();
  const create = () =>
    run(async () => {
      const c = await api<CourseDto>("/training", { method: "POST", body: { title, summary: summary || null, scope } });
      router.push(`/training/${c.id}`);
    });
  return (
    <Modal
      title="New course"
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <Button disabled={busy || !title.trim()} onClick={() => void create()}>
            {busy ? "Creating…" : "Create course"}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      }
    >
      <ScopePicker rights={list.rights} value={scope} onChange={setScope} />
      <Field label="Course title">
        <input className={inputClass} value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} autoFocus />
      </Field>
      <Field label="What it covers (optional)">
        <textarea className={`${inputClass} min-h-[100px] py-3`} value={summary} maxLength={2000} onChange={(e) => setSummary(e.target.value)} />
      </Field>
      <p className="text-[14px] text-ink-muted">The course stays a draft, seen only by people who can edit it, until you publish it.</p>
      <ErrorText>{error}</ErrorText>
    </Modal>
  );
}

export default function Training() {
  const { ready } = useGuard("library");
  const list = useApi<CourseListDto>(ready ? "/training" : null);
  const [creating, setCreating] = useState(false);
  if (!ready || list.loading || !list.data) return <Loading />;
  const data = list.data;
  const canAdd = data.rights.org || data.rights.daveup;
  const started = data.courses.filter((c) => c.completedCount > 0 && c.completedCount < c.lessonCount);

  return (
    <Screen nav>
      <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
        <H1 sub="Courses to grow in faith and leadership, at your own pace.">Training</H1>
        {canAdd && <Button onClick={() => setCreating(true)}>New course</Button>}
      </div>
      {started.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-[18px] font-extrabold text-ink">Continue</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {started.map((c) => (
              <CourseCard key={c.id} c={c} orgName={data.rights.orgName} />
            ))}
          </div>
        </section>
      )}
      {data.courses.length === 0 ? (
        <Card tone="soft">
          <p className="text-[16px] text-ink">{canAdd ? "No courses yet. Create the first one: add lessons with text, a video or a handout, then publish it." : "Courses from DaveUp and your organization will appear here."}</p>
        </Card>
      ) : (
        <section>
          {started.length > 0 && <h2 className="mb-3 text-[18px] font-extrabold text-ink">All courses</h2>}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.courses.map((c) => (
              <CourseCard key={c.id} c={c} orgName={data.rights.orgName} />
            ))}
          </div>
        </section>
      )}
      {creating && <NewCourse list={data} onClose={() => setCreating(false)} />}
    </Screen>
  );
}

function CourseCard({ c, orgName }: { c: CourseSummaryDto; orgName: string | null }) {
  return (
    <Link href={`/training/${c.id}`} className="flex flex-col rounded-card border border-surface-line bg-card p-5 transition-shadow hover:border-brand-line hover:shadow-md">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <ScopeBadge scope={c.scope} orgName={orgName} />
        {!c.published && <Pill tone="amber">Draft</Pill>}
      </div>
      <h3 className="text-[18px] font-bold leading-snug text-ink">{c.title}</h3>
      {c.summary && <p className="mt-1 line-clamp-2 text-[14px] text-ink-muted">{c.summary}</p>}
      <span className="flex-1" />
      <Progress c={c} />
    </Link>
  );
}
