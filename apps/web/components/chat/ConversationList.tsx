"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ConversationDetailDto, ConversationSummaryDto } from "@daveup/shared";
import { api, useAction, useApi } from "@/lib/api";
import { useRealtime, useRealtimeEvent } from "@/lib/realtime";
import { Initials, Loading, inputClass } from "../ui";
import { CellGlyph, PeoplePicker, shortWhen } from "./kit";

type Tab = "all" | "direct" | "cell" | "unread";

const TILE = ["bg-brand text-on-brand", "bg-[#6D28D9] text-white", "bg-[#0F766E] text-white", "bg-[#B45309] text-white"];
const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";

/** Debounced reload: a burst of events causes one request. */
function useSoonReload(reload: () => Promise<void> | void, ms = 250) {
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (t.current && clearTimeout(t.current)), []);
  return () => {
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(() => void reload(), ms);
  };
}

export function ConversationList({ selectedId }: { selectedId: string | null }) {
  const list = useApi<ConversationSummaryDto[]>("/conversations");
  const { epoch } = useRealtime();
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");
  const [picking, setPicking] = useState(false);
  const router = useRouter();
  const { busy, run, error } = useAction();
  const soon = useSoonReload(list.reload);

  useRealtimeEvent((e) => {
    if (e.type === "message" || e.type === "conversation" || e.type === "read" || e.type === "message.changed" || e.type.startsWith("call.")) soon();
  });
  useEffect(() => {
    if (epoch > 1) soon();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [epoch]);

  const all = list.data ?? [];
  const unread = all.filter((c) => c.unread > 0).length;
  const cells = all.filter((c) => c.kind === "cell" && !c.archived);
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return all.filter((c) => (tab === "all" || (tab === "unread" ? c.unread > 0 : c.kind === tab)) && (!n || c.title.toLowerCase().includes(n)));
  }, [all, tab, q]);

  const startChat = (ids: string[]) =>
    run(async () => {
      const c = await api<ConversationDetailDto>("/conversations/direct", { method: "POST", body: { personId: ids[0] } });
      setPicking(false);
      await list.reload();
      router.push(`/messages/${c.id}`);
    });

  return (
    <div className="flex h-full flex-col bg-page">
      <div className="space-y-4 px-4 pb-3 pt-5">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-display text-[40px] font-extrabold leading-none tracking-tight text-ink md:text-[30px]">Spaces</h1>
          <button onClick={() => setPicking(true)} aria-label="New chat" title="New chat" className="flex h-14 w-14 items-center justify-center rounded-full bg-brand text-on-brand shadow-[0_8px_24px_-8px_rgba(1,253,255,.6)] hover:bg-brand-dark md:h-11 md:w-11">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>
        <label className="flex items-center gap-3 rounded-full border border-surface-line bg-card px-5 py-3.5 text-ink-muted focus-within:border-brand">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people and spaces" className="min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-ink-muted" aria-label="Search people and spaces" />
        </label>

        {cells.length > 0 && !q && (
          <div>
            <p className="mb-2 text-[14px] font-extrabold tracking-[0.12em] text-ink-muted">YOUR SPACES</p>
            <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
              {cells.map((c, i) => (
                <Link key={c.id} href={`/messages/${c.id}`} className="w-[200px] shrink-0 rounded-[24px] border border-surface-line bg-card p-4 hover:border-brand-line md:w-[170px]">
                  <span className={`flex h-12 w-12 items-center justify-center rounded-2xl text-[16px] font-extrabold ${TILE[i % TILE.length]}`}>{initialsOf(c.title)}</span>
                  <span className="mt-3 block truncate text-[17px] font-bold text-ink">{c.title}</span>
                  <span className="block truncate text-[14px] text-ink-muted">{c.activeCall ? "Call in progress" : `${c.memberCount} members`}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="-mx-4 flex gap-2 overflow-x-auto px-4" role="tablist">
          {(
            [
              ["all", "All"],
              ["direct", "People"],
              ["cell", "Spaces"],
              ["unread", unread ? `Unread ${unread}` : "Unread"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={`shrink-0 rounded-full px-5 py-2.5 text-[16px] font-bold ${tab === k ? "bg-brand text-on-brand" : "border border-surface-line bg-card text-ink"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {error && <p className="text-[13px] text-danger-dark">{error}</p>}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {list.loading && <Loading />}
        {list.error && <p className="p-4 text-[14px] text-danger-dark">{list.error.message}</p>}
        {!list.loading && shown.length === 0 && (
          <div className="px-6 py-12 text-center">
            <p className="text-[16px] font-semibold text-ink">{q ? "Nothing matches that search" : tab === "cell" ? "You are not in a space yet" : tab === "unread" ? "All caught up" : "No conversations yet"}</p>
            <p className="mt-1 text-[14px] text-ink-muted">{tab === "cell" ? "Your organization administrator adds people to cells." : "Start a chat with anyone in your organization."}</p>
          </div>
        )}
        <ul>
          {shown.map((c) => (
            <li key={c.id}>
              <Link
                href={`/messages/${c.id}`}
                aria-current={c.id === selectedId ? "page" : undefined}
                className={`mx-4 flex items-center gap-3 border-b border-surface-line py-3.5 transition-colors ${c.id === selectedId ? "bg-brand-soft" : "hover:bg-surface/50"}`}
              >
                <span className="relative">
                  {c.kind === "cell" ? (
                    <span className={`flex h-14 w-14 items-center justify-center rounded-full text-[17px] font-extrabold ${TILE[Math.max(0, cells.indexOf(c)) % TILE.length]}`}>{initialsOf(c.title)}</span>
                  ) : (
                    <Initials name={c.title} size={56} />
                  )}
                  {c.activeCall && <span className="absolute -bottom-0.5 -right-0.5 h-4 w-4 animate-pulse rounded-full border-2 border-white bg-ok" title="Call in progress" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className={`truncate text-[18px] text-ink ${c.unread ? "font-extrabold" : "font-bold"}`}>{c.title}</span>
                    {c.kind === "cell" && <span className="shrink-0 rounded-md bg-brand-soft px-2 py-0.5 text-[13px] font-bold text-brand">Cell</span>}
                    <span className="ml-auto shrink-0 text-[14px] text-ink-muted">{shortWhen(c.lastMessage?.at ?? c.lastMessageAt)}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className={`truncate text-[15px] ${c.unread ? "font-semibold text-ink" : "text-ink-muted"}`}>
                      {c.activeCall
                        ? `${c.activeCall.media === "video" ? "Video" : "Voice"} call in progress`
                        : c.lastMessage
                          ? `${c.kind === "cell" && c.lastMessage.senderName ? `${c.lastMessage.senderName.split(" ")[0]}: ` : ""}${c.lastMessage.preview}`
                          : c.kind === "cell"
                            ? `${c.memberCount} members`
                            : "Say hello"}
                    </span>
                    {c.archived && <span className="shrink-0 rounded-full bg-surface-line px-2 text-[11px] font-semibold text-ink-muted">Archived</span>}
                    {c.unread > 0 && <span className="ml-auto min-w-[26px] shrink-0 rounded-full bg-brand px-1.5 text-center text-[14px] font-extrabold leading-[26px] text-on-brand">{c.unread > 99 ? "99+" : c.unread}</span>}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
      {picking && <PeoplePicker title="New chat" busy={busy} onPick={startChat} onClose={() => setPicking(false)} />}
    </div>
  );
}
