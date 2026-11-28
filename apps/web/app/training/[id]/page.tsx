"use client";
// One course: its lessons, the open lesson, and your progress. People who can
// edit the course also manage it here.
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { CourseDto, LessonDto, LibraryFileDto } from "@daveup/shared";
import { Screen, Button, Card, ErrorText, Field, Loading, Pill, TopBar, inputClass } from "@/components/ui";
import { Modal } from "@/components/chat/kit";
import { FilePicker, ScopeBadge, VideoEmbed, sizeLabel } from "@/components/library/kit";
import { api, useAction, useApi } from "@/lib/api";
import { useGuard } from "@/lib/session";

function LessonForm({ course, lesson, onClose, onSaved }: { course: CourseDto; lesson: LessonDto | null; onClose: () => void; onSaved: (c: CourseDto) => void }) {
  const [title, setTitle] = useState(lesson?.title ?? "");
  const [body, setBody] = useState(lesson?.body ?? "");
  const [videoUrl, setVideoUrl] = useState(lesson?.videoUrl ?? "");
  const [file, setFile] = useState<LibraryFileDto | null>(lesson?.file ?? null);
  const { busy, error, run } = useAction();
  const save = () =>
    run(async () => {
      const payload = { title, body, videoUrl: videoUrl.trim() || null, fileId: file?.id ?? null };
      onSaved(lesson ? await api<CourseDto>(`/lessons/${lesson.id}`, { method: "PUT", body: payload }) : await api<CourseDto>(`/training/${course.id}/lessons`, { method: "POST", body: payload }));
    });
  return (
    <Modal
      title={lesson ? "Edit lesson" : "Add a lesson"}
      onClose={onClose}
      wide
      footer={
        <div className="flex gap-2">
          <Button disabled={busy || !title.trim()} onClick={() => void save()}>
            {busy ? "Saving…" : lesson ? "Save lesson" : "Add lesson"}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      }
    >
      <Field label="Lesson title">
        <input className={inputClass} value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} autoFocus />
      </Field>
      <Field label="Video (optional)" hint="A YouTube or Vimeo address plays inside the lesson.">
        <input className={inputClass} type="url" inputMode="url" placeholder="https://" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} />
      </Field>
      <Field label="Lesson text">
        <textarea className={`${inputClass} min-h-[200px] py-3 leading-relaxed`} value={body} maxLength={50000} onChange={(e) => setBody(e.target.value)} placeholder="Teaching, scripture, questions to think about…" />
      </Field>
      <div className="mb-4">
        <p className="mb-1.5 text-[14px] font-semibold text-ink">Handout (optional)</p>
        <FilePicker scope={course.scope} value={file} onChange={setFile} />
      </div>
      <ErrorText>{error}</ErrorText>
    </Modal>
  );
}

function CourseSettings({ course, onClose, onSaved }: { course: CourseDto; onClose: () => void; onSaved: (c: CourseDto) => void }) {
  const router = useRouter();
  const [title, setTitle] = useState(course.title);
  const [summary, setSummary] = useState(course.summary ?? "");
  const [confirm, setConfirm] = useState(false);
  const { busy, error, run } = useAction();
  return (
    <Modal
      title="Course details"
      onClose={onClose}
      footer={
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={busy || !title.trim()} onClick={() => void run(async () => onSaved(await api<CourseDto>(`/training/${course.id}`, { method: "PUT", body: { title, summary: summary || null } })))}>
            Save
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <span className="flex-1" />
          {confirm ? (
            <Button
              variant="danger"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await api(`/training/${course.id}`, { method: "DELETE" });
                  router.replace("/training");
                })
              }
            >
              Delete course for good
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => setConfirm(true)}>
              Delete course
            </Button>
          )}
        </div>
      }
    >
      <Field label="Course title">
        <input className={inputClass} value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="What it covers">
        <textarea className={`${inputClass} min-h-[100px] py-3`} value={summary} maxLength={2000} onChange={(e) => setSummary(e.target.value)} />
      </Field>
      <ErrorText>{error}</ErrorText>
    </Modal>
  );
}

function Attachment({ file }: { file: LibraryFileDto }) {
  return (
    <a href={`${file.url}?inline=1`} target="_blank" rel="noopener" className="mt-5 flex items-center gap-3 rounded-2xl border border-surface-line px-4 py-3 hover:border-brand-line">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-brand" aria-hidden>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM14 2v6h6" />
        </svg>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold text-ink">{file.name}</span>
        <span className="text-[13px] text-ink-muted">Handout · {sizeLabel(file.size)}</span>
      </span>
      <span className="text-[14px] font-semibold text-brand">Open</span>
    </a>
  );
}

export default function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { me, ready } = useGuard("library");
  const res = useApi<CourseDto>(ready ? `/training/${id}` : null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState<{ lesson: LessonDto | null } | null>(null);
  const [settings, setSettings] = useState(false);
  const { busy, error, run } = useAction();

  const c = res.data;
  // Open the first lesson not yet done.
  useEffect(() => {
    if (c && !openId && c.lessons.length) setOpenId((c.lessons.find((l) => !l.completed) ?? c.lessons[0]!).id);
  }, [c, openId]);

  if (!ready || res.loading) return <Loading />;
  if (!c) return <Screen nav><ErrorText>{res.error?.message ?? "Course not found"}</ErrorText></Screen>;

  const idx = c.lessons.findIndex((l) => l.id === openId);
  const lesson = idx >= 0 ? c.lessons[idx]! : null;
  const set = (x: CourseDto) => res.setData(x);
  const mark = (l: LessonDto, done: boolean) =>
    run(async () => {
      await api(`/lessons/${l.id}/progress`, { method: "PUT", body: { done } });
      const lessons = c.lessons.map((x) => (x.id === l.id ? { ...x, completed: done } : x));
      set({ ...c, lessons, completedCount: lessons.filter((x) => x.completed).length });
      if (done && idx < c.lessons.length - 1) setOpenId(c.lessons[idx + 1]!.id);
    });
  const lessonAction = (path: string, method: "POST" | "DELETE", body?: unknown) => run(async () => set(await api<CourseDto>(path, { method, body })));
  const pct = c.lessonCount ? Math.round((c.completedCount / c.lessonCount) * 100) : 0;

  return (
    <Screen nav>
      <TopBar back="/training" title="Training" />
      <div className="mb-6">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <ScopeBadge scope={c.scope} orgName={me?.membership?.churchName ?? null} />
          {!c.published && <Pill tone="amber">Draft: only editors can see it</Pill>}
        </div>
        <h1 className="text-[28px] font-extrabold leading-tight tracking-tight text-ink md:text-[32px]">{c.title}</h1>
        {c.summary && <p className="mt-2 max-w-3xl text-[16px] text-ink-muted">{c.summary}</p>}
        <div className="mt-4 flex max-w-md items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-line">
            <div className={`h-full rounded-full ${pct === 100 ? "bg-ok" : "bg-brand"}`} style={{ width: `${pct}%` }} />
          </div>
          <span className="text-[14px] font-semibold text-ink-muted">
            {c.completedCount} of {c.lessonCount} done
          </span>
        </div>
        {c.canEdit && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => setForm({ lesson: null })}>Add lesson</Button>
            <Button variant="secondary" disabled={busy || (!c.published && c.lessonCount === 0)} onClick={() => void run(async () => set(await api<CourseDto>(`/training/${c.id}`, { method: "PUT", body: { published: !c.published } })))}>
              {c.published ? "Unpublish" : "Publish"}
            </Button>
            <Button variant="ghost" onClick={() => setSettings(true)}>
              Course details
            </Button>
          </div>
        )}
      </div>
      <ErrorText>{error}</ErrorText>

      {c.lessons.length === 0 ? (
        <Card tone="soft">
          <p className="text-[16px] text-ink">{c.canEdit ? "Add the first lesson: some teaching text, a video, a handout, or all three." : "This course has no lessons yet."}</p>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
          <ol className="space-y-1 lg:sticky lg:top-24 lg:self-start">
            {c.lessons.map((l, i) => (
              <li key={l.id}>
                <button
                  onClick={() => setOpenId(l.id)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${l.id === openId ? "bg-brand-soft" : "hover:bg-surface"}`}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold ${l.completed ? "bg-ok text-on-brand" : l.id === openId ? "bg-brand text-on-brand" : "bg-surface-line text-ink-muted"}`}
                  >
                    {l.completed ? "✓" : i + 1}
                  </span>
                  <span className={`min-w-0 flex-1 truncate text-[15px] ${l.id === openId ? "font-bold text-brand" : "font-semibold text-ink"}`}>{l.title}</span>
                </button>
              </li>
            ))}
          </ol>

          {lesson && (
            <Card className="!p-5 md:!p-8">
              <p className="mb-1 text-[13px] font-bold uppercase tracking-wider text-brand">
                Lesson {idx + 1} of {c.lessons.length}
              </p>
              <h2 className="mb-4 text-[24px] font-extrabold leading-tight text-ink">{lesson.title}</h2>
              {lesson.videoUrl && (
                <div className="mb-5">
                  <VideoEmbed url={lesson.videoUrl} title={lesson.title} />
                </div>
              )}
              {lesson.body && <div className="whitespace-pre-wrap text-[17px] leading-relaxed text-ink">{lesson.body}</div>}
              {lesson.file && <Attachment file={lesson.file} />}
              <div className="mt-8 flex flex-wrap items-center gap-2 border-t border-surface-line pt-5">
                {lesson.completed ? (
                  <Button variant="secondary" disabled={busy} onClick={() => void mark(lesson, false)}>
                    ✓ Done · mark as not done
                  </Button>
                ) : (
                  <Button disabled={busy} onClick={() => void mark(lesson, true)}>
                    {idx < c.lessons.length - 1 ? "Mark as done and continue" : "Mark as done"}
                  </Button>
                )}
                {idx > 0 && (
                  <Button variant="ghost" onClick={() => setOpenId(c.lessons[idx - 1]!.id)}>
                    Previous
                  </Button>
                )}
                {idx < c.lessons.length - 1 && (
                  <Button variant="ghost" onClick={() => setOpenId(c.lessons[idx + 1]!.id)}>
                    Next
                  </Button>
                )}
              </div>
              {c.canEdit && (
                <div className="mt-4 flex flex-wrap gap-1 rounded-2xl bg-surface p-2">
                  <Button variant="ghost" className="!min-h-[40px] text-[14px]" onClick={() => setForm({ lesson })}>
                    Edit lesson
                  </Button>
                  <Button variant="ghost" className="!min-h-[40px] text-[14px]" disabled={busy || idx === 0} onClick={() => void lessonAction(`/lessons/${lesson.id}/move`, "POST", { direction: "up" })}>
                    Move up
                  </Button>
                  <Button variant="ghost" className="!min-h-[40px] text-[14px]" disabled={busy || idx === c.lessons.length - 1} onClick={() => void lessonAction(`/lessons/${lesson.id}/move`, "POST", { direction: "down" })}>
                    Move down
                  </Button>
                  <Button
                    variant="ghost"
                    className="!min-h-[40px] text-[14px] !text-danger"
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm(`Delete the lesson "${lesson.title}"?`)) {
                        setOpenId(null);
                        void lessonAction(`/lessons/${lesson.id}`, "DELETE");
                      }
                    }}
                  >
                    Delete lesson
                  </Button>
                </div>
              )}
            </Card>
          )}
        </div>
      )}
      {form && <LessonForm course={c} lesson={form.lesson} onClose={() => setForm(null)} onSaved={(x) => (set(x), setForm(null), !form.lesson && setOpenId(x.lessons.at(-1)!.id))} />}
      {settings && <CourseSettings course={c} onClose={() => setSettings(false)} onSaved={(x) => (set(x), setSettings(false))} />}
    </Screen>
  );
}
