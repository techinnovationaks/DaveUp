"use client";
// Small building blocks for chat screens: formatting, links in text, file
// uploads with progress, a modal, and the people picker.
import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import type { DirectoryPersonDto, MessageDto, UploadTicketDto } from "@daveup/shared";
import { api, ApiError, useApi } from "@/lib/api";
import { Button, Initials, Loading, inputClass } from "../ui";

export const time = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date();
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", ...(d.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}) });
}

/** "10:42" today, "Mon" this week, else "12 Mar". */
export function shortWhen(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return time(iso);
  if (now.getTime() - d.getTime() < 6 * 86_400_000) return d.toLocaleDateString(undefined, { weekday: "short" });
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function fileSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function duration(s: number): string {
  if (s < 60) return `${s} sec`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

const URL_RE = /(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]])/g;

/** Message text with web links made clickable. Everything else stays plain text. */
export function Linkify({ text }: { text: string }) {
  const parts = text.split(URL_RE);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <a key={i} href={p} target="_blank" rel="noopener noreferrer nofollow" className="break-all underline underline-offset-2">
            {p}
          </a>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

export function isImage(mime: string) {
  return /^image\/(png|jpe?g|gif|webp|avif)$/i.test(mime);
}

export function FileGlyph({ mime, size = 40 }: { mime: string; size?: number }) {
  const label = mime === "application/pdf" ? "PDF" : mime.startsWith("image/") ? "IMG" : mime.startsWith("video/") ? "VID" : mime.startsWith("audio/") ? "AUD" : /word|document/.test(mime) ? "DOC" : /sheet|excel|csv/.test(mime) ? "XLS" : /presentation|powerpoint/.test(mime) ? "PPT" : /zip|compressed/.test(mime) ? "ZIP" : "FILE";
  return (
    <span style={{ width: size, height: size }} className="flex shrink-0 items-center justify-center rounded-xl bg-brand-soft text-[11px] font-extrabold tracking-wide text-brand">
      {label}
    </span>
  );
}

/** Upload one file into a conversation, reporting progress (0 to 1). Returns the posted message. */
export async function uploadFile(conversationId: string, file: File, onProgress: (p: number) => void, caption?: string): Promise<MessageDto> {
  const ticket = await api<UploadTicketDto>(`/conversations/${conversationId}/files`, {
    method: "POST",
    body: { name: file.name, mime: file.type || "application/octet-stream", size: file.size },
  });
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", ticket.uploadUrl);
    for (const [k, v] of Object.entries(ticket.headers)) xhr.setRequestHeader(k, v);
    // Cookies only for our own API (local storage); never sent to the storage bucket.
    xhr.withCredentials = ticket.uploadUrl.startsWith("/");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new ApiError(xhr.status, "UPLOAD_FAILED", "The upload failed. Please try again.")));
    xhr.onerror = () => reject(new ApiError(0, "NETWORK", "The upload failed. Check your connection and try again."));
    xhr.send(file);
  });
  return api<MessageDto>(`/files/${ticket.fileId}/complete`, { method: "POST", body: caption ? { caption } : {} });
}

export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 md:items-center md:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={`flex max-h-[92dvh] w-full flex-col rounded-t-card bg-card shadow-2xl md:rounded-card ${wide ? "md:max-w-2xl" : "md:max-w-lg"}`}
      >
        <div className="flex items-center justify-between border-b border-surface-line px-5 py-4">
          <p className="text-[18px] font-extrabold text-ink">{title}</p>
          <button onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted hover:bg-surface">
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="border-t border-surface-line px-5 py-4">{footer}</div>}
      </div>
    </div>
  );
}

/**
 * Choose people from your church. Single: tap a person to pick them.
 * Multiple: tick people, then confirm.
 */
export function PeoplePicker({
  title,
  multiple,
  exclude = [],
  confirmLabel = "Add",
  busy,
  onPick,
  onClose,
}: {
  title: string;
  multiple?: boolean;
  exclude?: string[];
  confirmLabel?: string;
  busy?: boolean;
  onPick: (ids: string[]) => void;
  onClose: () => void;
}) {
  const { data, loading, error } = useApi<DirectoryPersonDto[]>("/people/directory");
  const [q, setQ] = useState("");
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (data ?? []).filter((p) => !exclude.includes(p.personId) && (!n || p.fullName.toLowerCase().includes(n) || (p.department ?? "").toLowerCase().includes(n)));
  }, [data, q, exclude]);
  const toggle = (id: string) =>
    setChosen((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        multiple ? (
          <Button full disabled={chosen.size === 0 || busy} onClick={() => onPick([...chosen])}>
            {busy ? "Saving…" : chosen.size ? `${confirmLabel} ${chosen.size}` : confirmLabel}
          </Button>
        ) : undefined
      }
    >
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or department" className={`${inputClass} mb-3`} />
      {loading && <Loading />}
      {error && <p className="text-[14px] text-danger-dark">{error.message}</p>}
      {!loading && shown.length === 0 && <p className="py-6 text-center text-[15px] text-ink-muted">{q ? "Nobody matches that search." : "Nobody else to add yet."}</p>}
      <ul className="divide-y divide-surface-line">
        {shown.map((p) => (
          <li key={p.personId}>
            <button
              disabled={busy}
              onClick={() => (multiple ? toggle(p.personId) : onPick([p.personId]))}
              className="flex w-full items-center gap-3 rounded-xl px-1 py-3 text-left hover:bg-surface disabled:opacity-60"
            >
              <Initials name={p.fullName} size={40} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[16px] font-semibold text-ink">{p.fullName}</span>
                <span className="block truncate text-[13px] text-ink-muted">{[p.department, p.isAdmin ? "Administrator" : null].filter(Boolean).join(" · ") || "Member"}</span>
              </span>
              {multiple && (
                <span className={`flex h-6 w-6 items-center justify-center rounded-md border-2 ${chosen.has(p.personId) ? "border-brand bg-brand text-on-brand" : "border-surface-line"}`} aria-hidden>
                  {chosen.has(p.personId) && "✓"}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

export function CellGlyph({ size = 48 }: { size?: number }) {
  return (
    <span style={{ width: size, height: size }} className="flex shrink-0 items-center justify-center rounded-2xl bg-brand text-on-brand">
      <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M16 3.5a4 4 0 0 1 0 7.5M18 14a6 6 0 0 1 4 7" />
      </svg>
    </span>
  );
}
