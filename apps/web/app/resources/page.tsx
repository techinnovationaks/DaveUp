"use client";
// Resources (N design 205): what is for you now, then the Bible, Trainings,
// Sermon packs and the Library. Real data only; parts not built yet say so.
import Link from "next/link";
import { useState, type ReactNode } from "react";
import type { CourseListDto, ResourceListDto } from "@daveup/shared";
import { Loading, Screen } from "@/components/ui";
import { useApi } from "@/lib/api";
import { useGuard } from "@/lib/session";

type Tab = "for-you" | "bible" | "trainings" | "packs" | "library";

const I = ({ d }: { d: string }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);
const ICON = {
  bible: "M5 4a2 2 0 0 1 2-2h11v18H7a2 2 0 0 0-2 2V4zM9 7h5",
  training: "M22 9 12 4 2 9l10 5 10-5zM6 11v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5",
  packs: "M6 2h12v20H6zM9 7h6M9 11h6M9 15h3",
  library: "M2 5c3-1.5 6-1.5 10 1 4-2.5 7-2.5 10-1v14c-3-1.5-6-1.5-10 1-4-2.5-7-2.5-10-1zM12 6v14",
};

function Tile({ href, icon, title, soon }: { href?: string; icon: string; title: string; soon?: boolean }) {
  const body = (
    <>
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-soft text-brand">
        <I d={icon} />
      </span>
      <span className="mt-5 block font-display text-[20px] font-extrabold text-ink">{title}</span>
      {soon && <span className="mt-1 block text-[13px] font-semibold text-ink-muted">Coming soon</span>}
    </>
  );
  const cls = "block rounded-[28px] border border-surface-line bg-card p-5 transition-colors";
  return href ? (
    <Link href={href} className={`${cls} hover:border-brand-line`}>
      {body}
    </Link>
  ) : (
    <div className={`${cls} opacity-70`}>{body}</div>
  );
}

function Row({ href, icon, title, sub, trailing }: { href: string; icon: string; title: string; sub: string; trailing?: ReactNode }) {
  return (
    <Link href={href} className="flex items-center gap-4 rounded-[28px] border border-surface-line bg-card p-4 transition-colors hover:border-brand-line">
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-ok-soft text-brand">
        <I d={icon} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-display text-[19px] font-extrabold text-ink">{title}</span>
        <span className="block text-[14px] text-ink-muted">{sub}</span>
      </span>
      {trailing}
    </Link>
  );
}

export default function Resources() {
  const { ready } = useGuard("library");
  const courses = useApi<CourseListDto>(ready ? "/training" : null);
  const library = useApi<ResourceListDto>(ready ? "/resources" : null);
  const [tab, setTab] = useState<Tab>("for-you");
  if (!ready || courses.loading || library.loading) return <Loading />;

  const inProgress = (courses.data?.courses ?? []).filter((c) => c.completedCount > 0 && c.completedCount < c.lessonCount);
  const fresh = (courses.data?.courses ?? []).filter((c) => c.published && c.completedCount === 0 && c.lessonCount > 0).slice(0, 2);
  const newest = (library.data?.resources ?? []).slice(0, 2);

  const tabs: { id: Tab; label: string }[] = [
    { id: "for-you", label: "For you" },
    { id: "bible", label: "Bible" },
    { id: "trainings", label: "Trainings" },
    { id: "packs", label: "Packs" },
    { id: "library", label: "Library" },
  ];

  return (
    <Screen nav>
      <h1 className="mb-5 font-display text-[40px] font-extrabold leading-tight tracking-tight text-ink">Resources</h1>
      <div className="-mx-4 mb-6 flex gap-2 overflow-x-auto px-4 pb-1">
        {tabs.map((t) =>
          t.id === "trainings" || t.id === "library" ? (
            <Link key={t.id} href={t.id === "trainings" ? "/training" : "/library"} className="shrink-0 rounded-full border border-surface-line bg-card px-5 py-2.5 text-[16px] font-bold text-ink hover:border-brand-line">
              {t.label}
            </Link>
          ) : (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`shrink-0 rounded-full px-5 py-2.5 text-[16px] font-bold ${tab === t.id ? "bg-brand text-on-brand" : "border border-surface-line bg-card text-ink"}`}
            >
              {t.label}
            </button>
          ),
        )}
      </div>

      {tab === "for-you" && (
        <div className="space-y-4">
          <div className="rounded-[32px] bg-brand-soft p-6">
            <p className="text-[13px] font-extrabold tracking-[0.14em] text-[#9DB8FF]">YOUR VERSE TODAY</p>
            <p className="mt-2 font-display text-[26px] font-extrabold leading-snug text-ink">Trust in the Lord with all your heart; and lean not unto thine own understanding.</p>
            <p className="mt-2 text-[15px] text-ink-muted">Proverbs 3:5, KJV</p>
            <p className="mt-4 text-[13px] text-ink-muted">The Bible reader and verses chosen for you are coming soon.</p>
          </div>
          {inProgress.map((c) => (
            <Row
              key={c.id}
              href={`/training/${c.id}`}
              icon={ICON.training}
              title={c.title}
              sub={`Lesson ${c.completedCount + 1} of ${c.lessonCount}`}
              trailing={
                <span className="h-2 w-24 shrink-0 overflow-hidden rounded-full bg-surface-line">
                  <span className="block h-full rounded-full bg-ok" style={{ width: `${Math.round((c.completedCount / c.lessonCount) * 100)}%` }} />
                </span>
              }
            />
          ))}
          {fresh.map((c) => (
            <Row key={c.id} href={`/training/${c.id}`} icon={ICON.training} title={c.title} sub={`${c.lessonCount} ${c.lessonCount === 1 ? "lesson" : "lessons"}`} trailing={<span className="rounded-lg bg-warn-soft px-2.5 py-1 text-[12px] font-extrabold text-warn">NEW</span>} />
          ))}
          {newest.map((r) => (
            <Row key={r.id} href="/library" icon={ICON.library} title={r.title} sub={`${r.category} · ${r.kind === "file" ? "Document" : r.kind === "video" ? "Video" : "Link"}`} />
          ))}
          <div className="grid grid-cols-2 gap-4">
            <Tile icon={ICON.bible} title="Bible" soon />
            <Tile href="/training" icon={ICON.training} title="Trainings" />
            <Tile icon={ICON.packs} title="Sermon packs" soon />
            <Tile href="/library" icon={ICON.library} title="Library" />
          </div>
        </div>
      )}
      {(tab === "bible" || tab === "packs") && (
        <div className="rounded-[28px] border border-dashed border-surface-line p-8 text-center">
          <p className="font-display text-[22px] font-extrabold text-ink">{tab === "bible" ? "The Bible is coming soon" : "Sermon packs are coming soon"}</p>
          <p className="mt-2 text-[15px] text-ink-muted">
            {tab === "bible" ? "Read, search and get passages assigned by your discipler, right here." : "Turn each Sunday's message into a week of reading, questions and practice."}
          </p>
        </div>
      )}
    </Screen>
  );
}
