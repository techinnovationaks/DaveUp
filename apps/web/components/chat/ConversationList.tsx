"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ConversationDetailDto, ConversationSummaryDto } from "@daveup/shared";
import { api, useAction, useApi } from "@/lib/api";
import { useRealtime, useRealtimeEvent } from "@/lib/realtime";
import { Initials, Loading, inputClass } from "../ui";
import { CellGlyph, PeoplePicker, shortWhen } from "./kit";

type Tab = "all" | "direct" | "cell";

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
  const counts = { all: all.length, direct: all.filter((c) => c.kind === "direct").length, cell: all.filter((c) => c.kind === "cell").length };
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return all.filter((c) => (tab === "all" || c.kind === tab) && (!n || c.title.toLowerCase().includes(n)));
  }, [all, tab, q]);

  const startChat = (ids: string[]) =>
    run(async () => {
      const c = await api<ConversationDetailDto>("/conversations/direct", { method: "POST", body: { personId: ids[0] } });
      setPicking(false);
      await list.reload();
      router.push(`/messages/${c.id}`);
    });

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="space-y-3 border-b border-surface-line px-4 pb-3 pt-4">
        <div className="flex items-center justify-between">
          <h1 className="text-[24px] font-extrabold tracking-tight text-ink md:text-[20px]">Spaces</h1>
          <button onClick={() => setPicking(true)} className="flex h-10 items-center gap-2 rounded-xl bg-brand px-3.5 text-[14px] font-bold text-white hover:bg-brand-dark">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
              <path d="M12 5v14M5 12h14" />
            </svg>
            New chat
          </button>
        </div>
        <div className="flex gap-1 rounded-xl bg-surface p-1" role="tablist">
          {(
            [
              ["all", "All"],
              ["direct", "Direct"],
              ["cell", "Cells"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={`flex-1 rounded-lg py-2 text-[14px] font-semibold ${tab === k ? "bg-white text-ink shadow-sm" : "text-ink-muted"}`}
            >
              {label}
              {counts[k] > 0 && <span className="ml-1 text-ink-faint">{counts[k]}</span>}
            </button>
          ))}
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search chats and cells" className={`${inputClass} py-2.5 text-[15px]`} aria-label="Search chats and cells" />
        {error && <p className="text-[13px] text-danger-dark">{error}</p>}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {list.loading && <Loading />}
        {list.error && <p className="p-4 text-[14px] text-danger-dark">{list.error.message}</p>}
        {!list.loading && shown.length === 0 && (
          <div className="px-6 py-12 text-center">
            <p className="text-[16px] font-semibold text-ink">{q ? "Nothing matches that search" : tab === "cell" ? "You are not in a cell yet" : "No conversations yet"}</p>
            <p className="mt-1 text-[14px] text-ink-muted">{tab === "cell" ? "Your organization administrator adds people to cells." : "Start a chat with anyone in your organization."}</p>
          </div>
        )}
        <ul>
          {shown.map((c) => (
            <li key={c.id}>
              <Link
                href={`/messages/${c.id}`}
                aria-current={c.id === selectedId ? "page" : undefined}
                className={`flex items-center gap-3 px-4 py-3 transition-colors ${c.id === selectedId ? "bg-brand-soft" : "hover:bg-surface"}`}
              >
                <span className="relative">
                  {c.kind === "cell" ? <CellGlyph size={48} /> : <Initials name={c.title} size={48} />}
                  {c.activeCall && <span className="absolute -bottom-0.5 -right-0.5 h-4 w-4 animate-pulse rounded-full border-2 border-white bg-ok" title="Call in progress" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className={`truncate text-[16px] text-ink ${c.unread ? "font-extrabold" : "font-semibold"}`}>{c.title}</span>
                    <span className="ml-auto shrink-0 text-[12px] text-ink-faint">{shortWhen(c.lastMessage?.at ?? c.lastMessageAt)}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className={`truncate text-[14px] ${c.unread ? "font-semibold text-ink" : "text-ink-muted"}`}>
                      {c.activeCall
                        ? `${c.activeCall.media === "video" ? "Video" : "Voice"} call in progress`
                        : c.lastMessage
                          ? `${c.kind === "cell" && c.lastMessage.senderName ? `${c.lastMessage.senderName.split(" ")[0]}: ` : ""}${c.lastMessage.preview}`
                          : c.kind === "cell"
                            ? `${c.memberCount} members`
                            : "Say hello"}
                    </span>
                    {c.archived && <span className="shrink-0 rounded-full bg-surface-line px-2 text-[11px] font-semibold text-ink-muted">Archived</span>}
                    {c.unread > 0 && <span className="ml-auto min-w-[22px] shrink-0 rounded-full bg-brand px-1.5 text-center text-[12px] font-bold leading-[22px] text-white">{c.unread > 99 ? "99+" : c.unread}</span>}
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
