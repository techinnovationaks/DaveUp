"use client";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { MESSAGE_MAX_CHARS, type ConversationDetailDto, type MessageDto, type MessagesPageDto } from "@daveup/shared";
import { api, ApiError, useApi } from "@/lib/api";
import { useRealtime, useRealtimeEvent } from "@/lib/realtime";
import { useSession } from "@/lib/session";
import { CallIcon, useCalls } from "../call/CallProvider";
import { Initials, Loading } from "../ui";
import { InfoPanel } from "./InfoPanel";
import { CellGlyph, dayLabel, duration, FileGlyph, fileSize, isImage, Linkify, time, uploadFile } from "./kit";

/** A message the person sent that the server has not confirmed yet. */
interface Pending {
  clientId: string;
  body: string;
  failed: boolean;
}

interface Upload {
  key: string;
  name: string;
  progress: number;
  error: string | null;
  file: File;
}

const EDIT_MS = 24 * 3_600_000;

function merge(list: MessageDto[], more: MessageDto[]): MessageDto[] {
  const byId = new Map(list.map((m) => [m.id, m]));
  for (const m of more) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.seq - b.seq);
}

export function Thread({ id }: { id: string }) {
  const { me } = useSession();
  const { features, send, epoch } = useRealtime();
  const calls = useCalls();
  const conv = useApi<ConversationDetailDto>(`/conversations/${id}`);
  const [messages, setMessages] = useState<MessageDto[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [typing, setTyping] = useState<Map<string, { name: string; until: number }>>(new Map());
  const [info, setInfo] = useState(false);
  const [editing, setEditing] = useState<MessageDto | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const lastRead = useRef(0);
  const myId = me?.person.id;
  const last = messages[messages.length - 1];

  // ---- Loading ----
  const loadLatest = useCallback(async () => {
    try {
      const page = await api<MessagesPageDto>(`/conversations/${id}/messages`);
      setMessages(page.messages);
      setHasMore(page.hasMore);
      setLoadError(null);
      atBottom.current = true;
    } catch (e) {
      setLoadError(e instanceof ApiError ? e.message : "Could not load messages");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    setMessages([]);
    setPending([]);
    setUploads([]);
    setLoading(true);
    setInfo(false);
    setEditing(null);
    lastRead.current = 0;
    void loadLatest();
  }, [id, loadLatest]);

  const lastSeq = useRef(0);
  lastSeq.current = last?.seq ?? 0;
  const loadNewer = useCallback(async () => {
    try {
      const page = await api<MessagesPageDto>(`/conversations/${id}/messages?after=${lastSeq.current}`);
      if (page.messages.length) setMessages((l) => merge(l, page.messages));
    } catch {
      /* the next event or reconnect catches up */
    }
  }, [id]);

  // After a reconnect, fetch whatever arrived while offline.
  useEffect(() => {
    if (epoch > 1) {
      void loadNewer();
      void conv.reload();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [epoch]);

  const loadOlder = async () => {
    const first = messages[0];
    if (!first) return;
    const el = scroller.current;
    const before = el ? el.scrollHeight - el.scrollTop : 0;
    const page = await api<MessagesPageDto>(`/conversations/${id}/messages?before=${first.seq}`);
    setMessages((l) => merge(l, page.messages));
    setHasMore(page.hasMore);
    // Keep the view where it was.
    requestAnimationFrame(() => {
      if (el) el.scrollTop = el.scrollHeight - before;
    });
  };

  useRealtimeEvent((e) => {
    if (!("conversationId" in e) || e.conversationId !== id) return;
    if (e.type === "message") void loadNewer();
    if (e.type === "message.changed") {
      void api<MessageDto>(`/messages/${e.messageId}`)
        .then((m) => setMessages((l) => (l.some((x) => x.id === m.id) ? merge(l, [m]) : l)))
        .catch(() => {});
    }
    if (e.type === "conversation" || e.type.startsWith("call.")) {
      void conv.reload().catch(() => {});
    }
    if (e.type === "typing") {
      setTyping((t) => new Map(t).set(e.personId, { name: e.name, until: Date.now() + 4500 }));
    }
    if (e.type === "message" && e.senderId) {
      setTyping((t) => {
        if (!t.has(e.senderId!)) return t;
        const n = new Map(t);
        n.delete(e.senderId!);
        return n;
      });
    }
  });

  // Expire typing indicators.
  useEffect(() => {
    if (typing.size === 0) return;
    const t = setInterval(() => {
      setTyping((m) => {
        const n = new Map([...m].filter(([, v]) => v.until > Date.now()));
        return n.size === m.size ? m : n;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [typing.size]);

  // ---- Scrolling ----
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages, pending, uploads, typing.size]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  // ---- Read markers: when the latest message is on screen and the tab is visible ----
  useEffect(() => {
    if (!last || last.seq <= lastRead.current) return;
    const mark = () => {
      if (document.visibilityState !== "visible" || !atBottom.current) return;
      lastRead.current = last.seq;
      void api(`/conversations/${id}/read`, { method: "POST", body: { seq: last.seq } }).catch(() => {});
    };
    mark();
    const el = scroller.current;
    el?.addEventListener("scroll", mark, { passive: true });
    document.addEventListener("visibilitychange", mark);
    return () => {
      el?.removeEventListener("scroll", mark);
      document.removeEventListener("visibilitychange", mark);
    };
  }, [last, id]);

  // ---- Sending ----
  const sendText = async (body: string, clientId = crypto.randomUUID()) => {
    atBottom.current = true;
    setPending((p) => [...p.filter((x) => x.clientId !== clientId), { clientId, body, failed: false }]);
    try {
      const m = await api<MessageDto>(`/conversations/${id}/messages`, { method: "POST", body: { body, clientId } });
      setMessages((l) => merge(l, [m]));
      setPending((p) => p.filter((x) => x.clientId !== clientId));
    } catch (e) {
      setPending((p) => p.map((x) => (x.clientId === clientId ? { ...x, failed: true } : x)));
      if (e instanceof ApiError && e.status !== 0) setActionError(e.message);
    }
  };

  const sendFiles = async (files: File[]) => {
    atBottom.current = true;
    const items = files.map((file) => ({ key: crypto.randomUUID(), name: file.name, progress: 0, error: null, file }));
    setUploads((u) => [...u, ...items]);
    for (const it of items) {
      if (features && it.file.size > features.fileMaxBytes) {
        setUploads((u) => u.map((x) => (x.key === it.key ? { ...x, error: `Too large (max ${fileSize(features.fileMaxBytes)})` } : x)));
        continue;
      }
      try {
        const m = await uploadFile(id, it.file, (p) => setUploads((u) => u.map((x) => (x.key === it.key ? { ...x, progress: p } : x))));
        setMessages((l) => merge(l, [m]));
        setUploads((u) => u.filter((x) => x.key !== it.key));
      } catch (e) {
        setUploads((u) => u.map((x) => (x.key === it.key ? { ...x, error: e instanceof Error ? e.message : "Upload failed" } : x)));
      }
    }
  };

  const saveEdit = async (m: MessageDto, body: string) => {
    try {
      const updated = await api<MessageDto>(`/messages/${m.id}`, { method: "PATCH", body: { body } });
      setMessages((l) => merge(l, [updated]));
      setEditing(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Could not save");
    }
  };

  const remove = async (m: MessageDto) => {
    if (!confirm(m.file ? "Delete this file for everyone?" : "Delete this message for everyone?")) return;
    try {
      const updated = await api<MessageDto>(`/messages/${m.id}`, { method: "DELETE" });
      setMessages((l) => merge(l, [updated]));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Could not delete");
    }
  };

  const c = conv.data;
  if (conv.error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-[17px] font-semibold text-ink">{conv.error.status === 404 ? "This conversation is not available" : conv.error.message}</p>
        <Link href="/messages" className="font-semibold text-brand">
          Back to messages
        </Link>
      </div>
    );
  }
  if (!c) return <Loading />;

  const member = c.members.some((m) => m.personId === myId);
  const moderator = c.kind === "cell" && (c.myRole === "leader" || !!me?.membership?.isAdmin);
  const writable = member && !c.readOnly;
  const inThisCall = calls.active?.conversationId === id;
  const typingNames = [...typing.values()].map((t) => t.name.split(" ")[0]);

  return (
    <div className="flex h-full min-w-0">
      <div className="flex min-w-0 flex-1 flex-col bg-surface">
        {/* Header */}
        <header className="flex shrink-0 items-center gap-3 border-b border-surface-line bg-white px-3 py-2.5 md:px-5">
          <Link href="/messages" aria-label="Back to messages" className="flex h-10 w-10 items-center justify-center rounded-full text-ink hover:bg-surface md:hidden">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M15 18l-6-6 6-6" /></svg>
          </Link>
          <button onClick={() => setInfo((v) => !v)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
            {c.kind === "cell" ? <CellGlyph size={40} /> : <Initials name={c.title} size={40} />}
            <span className="min-w-0">
              <span className="block truncate text-[16px] font-bold text-ink">{c.title}</span>
              <span className="block truncate text-[13px] text-ink-muted">
                {typingNames.length ? `${typingNames.join(", ")} ${typingNames.length > 1 ? "are" : "is"} typing…` : c.kind === "cell" ? `${c.memberCount} members${c.archived ? " · Archived" : ""}` : c.readOnly ? "No longer in your organization" : "Tap for files and details"}
              </span>
            </span>
          </button>
          {features?.calls && writable && !c.activeCall && (
            <>
              <HeaderButton label="Voice call" onClick={() => void calls.start(id, "audio", c.title)}>
                <CallIcon name="phone" size={20} />
              </HeaderButton>
              <HeaderButton label="Video call" onClick={() => void calls.start(id, "video", c.title)}>
                <CallIcon name="video" size={20} />
              </HeaderButton>
            </>
          )}
          <HeaderButton label="Details, members and files" active={info} onClick={() => setInfo((v) => !v)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>
          </HeaderButton>
        </header>

        {c.activeCall && !inThisCall && member && (
          <div className="flex shrink-0 items-center gap-3 bg-ok px-4 py-2.5 text-white">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-white" />
            <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">
              {c.activeCall.media === "video" ? "Video" : "Voice"} call · {c.activeCall.participantCount} in call
            </span>
            {features?.calls && (
              <button onClick={() => void calls.join(c.activeCall!.id, c.title)} className="rounded-xl bg-white px-4 py-1.5 text-[14px] font-bold text-ok">
                Join
              </button>
            )}
          </div>
        )}

        {/* Messages */}
        <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto px-3 py-4 md:px-6">
          {!member ? (
            <div className="mx-auto mt-10 max-w-sm rounded-card bg-white p-6 text-center">
              <p className="text-[16px] font-semibold text-ink">You manage this cell but are not in it</p>
              <p className="mt-1 text-[14px] text-ink-muted">Messages are only for the cell's members. Add yourself from the details panel to take part.</p>
            </div>
          ) : loading ? (
            <Loading />
          ) : (
            <>
              {loadError && <p className="mb-3 text-center text-[14px] text-danger-dark">{loadError}</p>}
              {hasMore && (
                <div className="mb-4 text-center">
                  <button onClick={() => void loadOlder()} className="rounded-full bg-white px-4 py-1.5 text-[13px] font-semibold text-brand shadow-sm hover:bg-brand-soft">
                    Load earlier messages
                  </button>
                </div>
              )}
              {messages.length === 0 && !hasMore && (
                <p className="mt-10 text-center text-[15px] text-ink-muted">{c.kind === "cell" ? "No messages in this cell yet." : `This is the start of your chat with ${c.title}.`}</p>
              )}
              <ol className="mx-auto flex max-w-3xl flex-col">
                {messages.map((m, i) => {
                  const prev = messages[i - 1];
                  const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
                  const grouped = !newDay && prev && prev.senderId === m.senderId && prev.kind !== "system" && m.kind !== "system" && new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60_000;
                  return (
                    <li key={m.id}>
                      {newDay && <DaySeparator iso={m.createdAt} />}
                      <MessageItem
                        m={m}
                        mine={m.senderId === myId}
                        showName={c.kind === "cell" && !grouped}
                        grouped={!!grouped}
                        canEdit={m.senderId === myId && m.kind === "text" && !m.deleted && writable && Date.now() - new Date(m.createdAt).getTime() < EDIT_MS}
                        canDelete={!m.deleted && (m.kind === "text" || m.kind === "file") && (m.senderId === myId || moderator)}
                        onEdit={() => setEditing(m)}
                        onDelete={() => void remove(m)}
                        onJoinCall={(callId) => features?.calls && void calls.join(callId, c.title)}
                        activeCallId={c.activeCall?.id ?? null}
                      />
                    </li>
                  );
                })}
                {pending.map((p) => (
                  <li key={p.clientId} className="mt-1 flex justify-end">
                    <div className={`max-w-[80%] rounded-2xl rounded-br-md px-3.5 py-2 text-[15px] text-white ${p.failed ? "bg-danger" : "bg-brand/60"}`}>
                      <p className="whitespace-pre-wrap break-words">{p.body}</p>
                      {p.failed ? (
                        <button onClick={() => void sendText(p.body, p.clientId)} className="mt-1 text-[12px] font-bold underline">
                          Not sent. Tap to retry
                        </button>
                      ) : (
                        <p className="mt-0.5 text-right text-[11px] text-white/70">Sending…</p>
                      )}
                    </div>
                  </li>
                ))}
                {uploads.map((u) => (
                  <li key={u.key} className="mt-1 flex justify-end">
                    <div className="w-64 rounded-2xl rounded-br-md bg-white p-3 shadow-sm">
                      <p className="truncate text-[14px] font-semibold text-ink">{u.name}</p>
                      {u.error ? (
                        <div className="mt-1 flex items-center justify-between gap-2">
                          <p className="text-[13px] text-danger-dark">{u.error}</p>
                          <button onClick={() => setUploads((x) => x.filter((y) => y.key !== u.key))} className="text-[13px] font-semibold text-ink-muted">
                            Dismiss
                          </button>
                        </div>
                      ) : (
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-line">
                          <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${Math.round(u.progress * 100)}%` }} />
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>

        {actionError && (
          <div className="flex items-center justify-between gap-3 bg-danger-soft px-4 py-2 text-[14px] text-danger-dark" role="alert">
            {actionError}
            <button onClick={() => setActionError(null)} aria-label="Dismiss">
              ✕
            </button>
          </div>
        )}

        {member &&
          (writable ? (
            <Composer
              key={id}
              conversationId={id}
              editing={editing}
              filesEnabled={!!features?.files}
              onCancelEdit={() => setEditing(null)}
              onSend={(body) => (editing ? saveEdit(editing, body) : sendText(body))}
              onFiles={sendFiles}
              onTyping={() => send({ type: "typing", conversationId: id })}
            />
          ) : (
            <p className="shrink-0 border-t border-surface-line bg-white px-4 py-4 text-center text-[14px] text-ink-muted">
              {c.archived ? "This cell is archived. You can read it, but not send messages." : "You can no longer send messages here."}
            </p>
          ))}
      </div>

      {info && (
        <InfoPanel
          conv={c}
          onClose={() => setInfo(false)}
          onChanged={(next) => conv.setData(next)}
          onLeft={() => {
            window.location.href = "/messages";
          }}
        />
      )}
    </div>
  );
}

function HeaderButton({ children, label, onClick, active }: { children: ReactNode; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${active ? "bg-brand-soft text-brand" : "text-ink-muted hover:bg-surface hover:text-ink"}`}>
      {children}
    </button>
  );
}

function DaySeparator({ iso }: { iso: string }) {
  return (
    <div className="my-4 flex justify-center">
      <span className="rounded-full bg-white px-3 py-1 text-[12px] font-semibold text-ink-muted shadow-sm">{dayLabel(iso)}</span>
    </div>
  );
}

function MessageItem({
  m,
  mine,
  showName,
  grouped,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
  onJoinCall,
  activeCallId,
}: {
  m: MessageDto;
  mine: boolean;
  showName: boolean;
  grouped: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onJoinCall: (callId: string) => void;
  activeCallId: string | null;
}) {
  const [menu, setMenu] = useState(false);

  if (m.kind === "system") {
    return <p className="my-2 text-center text-[13px] text-ink-muted">{m.body}</p>;
  }

  if (m.kind === "call" && m.call) {
    const live = !m.call.ended && activeCallId === m.call.id;
    const label = m.call.media === "video" ? "Video call" : "Voice call";
    const status = live ? "In progress" : !m.call.answered ? (mine ? "No answer" : "Missed") : m.call.durationSeconds !== null ? duration(m.call.durationSeconds) : "Ended";
    return (
      <div className={`my-2 flex ${mine ? "justify-end" : "justify-start"}`}>
        <div className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm">
          <span className={`flex h-10 w-10 items-center justify-center rounded-full ${live ? "bg-ok text-white" : !m.call.answered && !mine ? "bg-danger-soft text-danger" : "bg-brand-soft text-brand"}`}>
            <CallIcon name={m.call.media === "video" ? "video" : "phone"} size={18} />
          </span>
          <span>
            <span className="block text-[15px] font-semibold text-ink">
              {label}
              {!mine && m.senderName ? ` from ${m.senderName.split(" ")[0]}` : ""}
            </span>
            <span className="block text-[13px] text-ink-muted">
              {status} · {time(m.createdAt)}
            </span>
          </span>
          {live && (
            <button onClick={() => onJoinCall(m.call!.id)} className="ml-2 rounded-xl bg-ok px-3 py-1.5 text-[13px] font-bold text-white">
              Join
            </button>
          )}
        </div>
      </div>
    );
  }

  const bubble = mine ? "bg-brand text-white rounded-br-md" : "bg-white text-ink rounded-bl-md shadow-sm";
  const actions = (canEdit || canDelete) && !m.deleted;
  return (
    <div className={`group flex ${mine ? "justify-end" : "justify-start"} ${grouped ? "mt-0.5" : "mt-3"}`}>
      <div className={`relative flex max-w-[85%] flex-col md:max-w-[70%] ${mine ? "items-end" : "items-start"}`}>
        {showName && !mine && <span className="mb-1 ml-3 text-[12px] font-semibold text-brand">{m.senderName}</span>}
        <div className={`rounded-2xl ${m.file && isImage(m.file.mime) ? "p-1" : "px-3.5 py-2"} text-[15px] leading-relaxed ${m.deleted ? "border border-dashed border-surface-line bg-transparent text-ink-muted shadow-none" : bubble}`} onClick={() => actions && setMenu((v) => !v)}>
          {m.deleted ? (
            <p className="italic">This message was deleted</p>
          ) : (
            <>
              {m.file && <FileBody file={m.file} mine={mine} />}
              {m.body && (
                <p className={`whitespace-pre-wrap break-words ${m.file && isImage(m.file.mime) ? "px-2.5 pb-1 pt-1.5" : m.file ? "mt-2" : ""}`}>
                  <Linkify text={m.body} />
                </p>
              )}
            </>
          )}
          <p className={`mt-0.5 text-right text-[11px] ${m.file && isImage(m.file.mime) ? "px-2 pb-1" : ""} ${mine && !m.deleted ? "text-white/70" : "text-ink-faint"}`}>
            {m.editedAt && !m.deleted ? "edited · " : ""}
            {time(m.createdAt)}
          </p>
        </div>
        {actions && (
          <div className={`${menu ? "flex" : "hidden group-hover:flex"} absolute top-0 ${mine ? "right-full mr-1" : "left-full ml-1"} gap-1`}>
            {canEdit && (
              <button onClick={() => (setMenu(false), onEdit())} className="rounded-lg bg-white px-2 py-1 text-[12px] font-semibold text-ink shadow hover:bg-surface">
                Edit
              </button>
            )}
            {canDelete && (
              <button onClick={() => (setMenu(false), onDelete())} className="rounded-lg bg-white px-2 py-1 text-[12px] font-semibold text-danger shadow hover:bg-danger-soft">
                Delete
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function FileBody({ file, mine }: { file: NonNullable<MessageDto["file"]>; mine: boolean }) {
  if (isImage(file.mime)) {
    return (
      <a href={`${file.url}?inline=1`} target="_blank" rel="noopener noreferrer" title={file.name}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${file.url}?inline=1`} alt={file.name} loading="lazy" className="max-h-80 max-w-full rounded-xl object-contain md:max-w-sm" />
      </a>
    );
  }
  const viewable = file.mime === "application/pdf" || file.mime.startsWith("video/") || file.mime.startsWith("audio/");
  return (
    <div className="flex min-w-[220px] items-center gap-3">
      <FileGlyph mime={file.mime} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold">{file.name}</span>
        <span className={`block text-[12px] ${mine ? "text-white/70" : "text-ink-muted"}`}>{fileSize(file.size)}</span>
      </span>
      <span className="flex shrink-0 flex-col gap-1 text-[13px] font-bold">
        {viewable && (
          <a href={`${file.url}?inline=1`} target="_blank" rel="noopener noreferrer" className="underline" onClick={(e) => e.stopPropagation()}>
            Open
          </a>
        )}
        <a href={file.url} className="underline" onClick={(e) => e.stopPropagation()}>
          Download
        </a>
      </span>
    </div>
  );
}

function Composer({
  conversationId,
  editing,
  filesEnabled,
  onCancelEdit,
  onSend,
  onFiles,
  onTyping,
}: {
  conversationId: string;
  editing: MessageDto | null;
  filesEnabled: boolean;
  onCancelEdit: () => void;
  onSend: (body: string) => Promise<void> | void;
  onFiles: (files: File[]) => void;
  onTyping: () => void;
}) {
  const draftKey = `daveup.draft.${conversationId}`;
  const [text, setText] = useState(() => (typeof window === "undefined" ? "" : (sessionStorage.getItem(draftKey) ?? "")));
  const [dragging, setDragging] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setText(editing.body ?? "");
      area.current?.focus();
    }
  }, [editing]);

  useEffect(() => {
    if (!editing) sessionStorage.setItem(draftKey, text);
  }, [text, editing, draftKey]);

  // Grow with the text, up to a limit.
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [text]);

  const submit = () => {
    const body = text.trim();
    if (!body) return;
    setText("");
    if (!editing) sessionStorage.removeItem(draftKey);
    void onSend(body);
  };

  return (
    <div
      className={`shrink-0 border-t border-surface-line bg-white px-3 py-2.5 md:px-5 ${dragging ? "ring-2 ring-inset ring-brand" : ""}`}
      onDragOver={(e) => {
        if (!filesEnabled) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        if (!filesEnabled) return;
        e.preventDefault();
        setDragging(false);
        const files = [...e.dataTransfer.files];
        if (files.length) onFiles(files);
      }}
    >
      {editing && (
        <div className="mb-2 flex items-center justify-between rounded-xl bg-brand-soft px-3 py-1.5 text-[13px] text-brand">
          <span className="font-semibold">Editing message</span>
          <button
            onClick={() => {
              setText("");
              onCancelEdit();
            }}
            className="font-semibold"
          >
            Cancel
          </button>
        </div>
      )}
      <div className="mx-auto flex max-w-3xl items-end gap-2">
        {filesEnabled && !editing && (
          <>
            <button onClick={() => fileInput.current?.click()} aria-label="Share a file" title="Share files and documents" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-surface hover:text-ink">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M21.4 11.1l-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5" /></svg>
            </button>
            <input
              ref={fileInput}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                const files = [...(e.target.files ?? [])];
                e.target.value = "";
                if (files.length) onFiles(files);
              }}
            />
          </>
        )}
        <textarea
          ref={area}
          rows={1}
          value={text}
          maxLength={MESSAGE_MAX_CHARS}
          onChange={(e) => {
            setText(e.target.value);
            if (e.target.value) onTyping();
          }}
          onKeyDown={(e) => {
            // Enter sends on a keyboard; Shift+Enter adds a line. On phones the return key adds a line.
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia("(pointer: fine)").matches) {
              e.preventDefault();
              submit();
            }
            if (e.key === "Escape" && editing) {
              setText("");
              onCancelEdit();
            }
          }}
          onPaste={(e) => {
            if (!filesEnabled || editing) return;
            const files = [...e.clipboardData.files];
            if (files.length) {
              e.preventDefault();
              onFiles(files);
            }
          }}
          placeholder="Write a message"
          aria-label="Message"
          className="max-h-[180px] min-h-[44px] flex-1 resize-none rounded-2xl border border-surface-line bg-surface px-4 py-2.5 text-[16px] text-ink outline-none placeholder:text-ink-faint focus:border-brand focus:bg-white"
        />
        <button onClick={submit} disabled={!text.trim()} aria-label={editing ? "Save" : "Send"} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand text-white hover:bg-brand-dark disabled:bg-brand/40">
          {editing ? (
            "✓"
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>
          )}
        </button>
      </div>
    </div>
  );
}
