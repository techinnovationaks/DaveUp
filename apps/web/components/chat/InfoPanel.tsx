"use client";
import { useState } from "react";
import type { ConversationDetailDto, FileDto } from "@daveup/shared";
import { api, useAction, useApi } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Button, ErrorText, Initials, Loading, Pill, inputClass } from "../ui";
import { CellGlyph, FileGlyph, fileSize, isImage, PeoplePicker, shortWhen } from "./kit";

/** Members of a cell, with add / remove / leader controls for leaders and admins. */
export function CellMembers({ conv, onChanged, onLeft }: { conv: ConversationDetailDto; onChanged: (c: ConversationDetailDto) => void; onLeft?: () => void }) {
  const { me } = useSession();
  const { busy, error, run } = useAction();
  const [adding, setAdding] = useState(false);
  const myId = me?.person.id;
  const amMember = conv.members.some((m) => m.personId === myId);

  const add = (ids: string[]) =>
    run(async () => {
      onChanged(await api<ConversationDetailDto>(`/cells/${conv.id}/members`, { method: "POST", body: { personIds: ids } }));
      setAdding(false);
    });
  const setRole = (personId: string, role: "leader" | "member") =>
    run(async () => onChanged(await api<ConversationDetailDto>(`/cells/${conv.id}/members/${personId}`, { method: "PATCH", body: { role } })));
  const remove = (personId: string, name: string) => {
    if (!confirm(personId === myId ? `Leave ${conv.title}?` : `Remove ${name} from ${conv.title}?`)) return;
    return run(async () => {
      await api(`/cells/${conv.id}/members/${personId}`, { method: "DELETE" });
      if (personId === myId && !conv.canManage) return onLeft?.();
      onChanged(await api<ConversationDetailDto>(`/conversations/${conv.id}`));
    });
  };

  return (
    <div>
      <ErrorText>{error}</ErrorText>
      {conv.canManage && !conv.archived && (
        <div className="mb-3 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setAdding(true)} className="!min-h-[40px] !px-4 !text-[14px]">
            Add people
          </Button>
          {!amMember && me?.person.id && (
            <Button variant="ghost" disabled={busy} onClick={() => void add([me.person.id])} className="!min-h-[40px] !px-4 !text-[14px]">
              Add myself
            </Button>
          )}
        </div>
      )}
      <ul className="divide-y divide-surface-line">
        {conv.members.map((m) => (
          <li key={m.personId} className="flex items-center gap-3 py-2.5">
            <Initials name={m.fullName} size={36} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold text-ink">
                {m.fullName}
                {m.personId === myId && <span className="font-normal text-ink-muted"> (you)</span>}
              </span>
              {m.department && <span className="block truncate text-[12px] text-ink-muted">{m.department}</span>}
            </span>
            {m.role === "leader" && <Pill tone="green">Leader</Pill>}
            {conv.canManage && !conv.archived && (
              <details className="relative">
                <summary className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-full text-ink-muted hover:bg-surface" aria-label={`Options for ${m.fullName}`}>
                  ⋯
                </summary>
                <div className="absolute right-0 z-10 mt-1 w-48 overflow-hidden rounded-xl border border-surface-line bg-white py-1 shadow-lg">
                  <button disabled={busy} onClick={() => void setRole(m.personId, m.role === "leader" ? "member" : "leader")} className="block w-full px-3 py-2 text-left text-[14px] hover:bg-surface">
                    {m.role === "leader" ? "Make a member" : "Make a leader"}
                  </button>
                  <button disabled={busy} onClick={() => void remove(m.personId, m.fullName)} className="block w-full px-3 py-2 text-left text-[14px] text-danger hover:bg-danger-soft">
                    {m.personId === myId ? "Leave cell" : "Remove from cell"}
                  </button>
                </div>
              </details>
            )}
          </li>
        ))}
      </ul>
      {amMember && !conv.canManage && (
        <button onClick={() => void remove(myId!, "")} disabled={busy} className="mt-4 text-[14px] font-semibold text-danger">
          Leave this cell
        </button>
      )}
      {adding && (
        <PeoplePicker title={`Add to ${conv.title}`} multiple busy={busy} exclude={conv.members.map((m) => m.personId)} onPick={add} onClose={() => setAdding(false)} />
      )}
    </div>
  );
}

export function FilesList({ conversationId }: { conversationId: string }) {
  const files = useApi<FileDto[]>(`/conversations/${conversationId}/files`);
  if (files.loading) return <Loading />;
  if (files.error) return <p className="text-[14px] text-danger-dark">{files.error.message}</p>;
  const list = files.data ?? [];
  if (list.length === 0) return <p className="py-6 text-center text-[14px] text-ink-muted">Files and documents shared here will be listed.</p>;
  const images = list.filter((f) => isImage(f.mime));
  const docs = list.filter((f) => !isImage(f.mime));
  return (
    <div>
      {images.length > 0 && (
        <div className="mb-4 grid grid-cols-3 gap-1.5">
          {images.map((f) => (
            <a key={f.id} href={`${f.url}?inline=1`} target="_blank" rel="noopener noreferrer" title={f.name} className="aspect-square overflow-hidden rounded-lg bg-surface">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${f.url}?inline=1`} alt={f.name} loading="lazy" className="h-full w-full object-cover" />
            </a>
          ))}
        </div>
      )}
      <ul className="divide-y divide-surface-line">
        {docs.map((f) => (
          <li key={f.id}>
            <a href={f.url} className="flex items-center gap-3 py-2.5 hover:bg-surface">
              <FileGlyph mime={f.mime} size={36} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold text-ink">{f.name}</span>
                <span className="block text-[12px] text-ink-muted">
                  {fileSize(f.size)} · {f.uploaderName} · {shortWhen(f.createdAt)}
                </span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CellSettings({ conv, onChanged }: { conv: ConversationDetailDto; onChanged: (c: ConversationDetailDto) => void }) {
  const { me } = useSession();
  const [name, setName] = useState(conv.title);
  const [description, setDescription] = useState(conv.description ?? "");
  const { busy, error, run } = useAction();
  const dirty = name.trim() !== conv.title || description.trim() !== (conv.description ?? "");
  const isAdmin = !!me?.membership?.isAdmin;
  return (
    <div className="space-y-3">
      <ErrorText>{error}</ErrorText>
      <label className="block">
        <span className="mb-1 block text-[13px] font-semibold text-ink">Name</span>
        <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} className={`${inputClass} py-2.5 text-[15px]`} disabled={conv.archived} />
      </label>
      <label className="block">
        <span className="mb-1 block text-[13px] font-semibold text-ink">Description</span>
        <textarea value={description} maxLength={500} rows={3} onChange={(e) => setDescription(e.target.value)} className={`${inputClass} py-2.5 text-[15px]`} disabled={conv.archived} placeholder="When and where the cell meets" />
      </label>
      {dirty && (
        <Button disabled={busy || name.trim().length < 2} onClick={() => run(async () => onChanged(await api<ConversationDetailDto>(`/cells/${conv.id}`, { method: "PATCH", body: { name: name.trim(), description: description.trim() } })))}>
          Save
        </Button>
      )}
      {isAdmin && (
        <div className="border-t border-surface-line pt-3">
          <Button
            variant={conv.archived ? "secondary" : "danger"}
            disabled={busy}
            onClick={() => {
              if (!conv.archived && !confirm(`Archive ${conv.title}? Members can still read it, but no one can send messages.`)) return;
              void run(async () => onChanged(await api<ConversationDetailDto>(`/cells/${conv.id}/${conv.archived ? "unarchive" : "archive"}`, { method: "POST" })));
            }}
          >
            {conv.archived ? "Reopen cell" : "Archive cell"}
          </Button>
        </div>
      )}
    </div>
  );
}

/** Right-hand panel (overlay on small screens): who is here, shared files, cell settings. */
export function InfoPanel({ conv, onClose, onChanged, onLeft }: { conv: ConversationDetailDto; onClose: () => void; onChanged: (c: ConversationDetailDto) => void; onLeft: () => void }) {
  const { me } = useSession();
  const isMember = conv.members.some((m) => m.personId === me?.person.id);
  const tabs = [...(conv.kind === "cell" ? (["members"] as const) : []), ...(isMember ? (["files"] as const) : []), ...(conv.kind === "cell" && conv.canManage ? (["settings"] as const) : [])];
  const [tab, setTab] = useState<(typeof tabs)[number]>(tabs[0] ?? "files");
  const other = conv.kind === "direct" ? conv.members.find((m) => m.personId !== me?.person.id) : null;

  return (
    <aside className="fixed inset-0 z-40 flex flex-col bg-white lg:static lg:z-auto lg:w-[340px] lg:shrink-0 lg:border-l lg:border-surface-line">
      <div className="flex items-center justify-between border-b border-surface-line px-4 py-3">
        <p className="text-[16px] font-bold text-ink">{conv.kind === "cell" ? "Cell details" : "Details"}</p>
        <button onClick={onClose} aria-label="Close details" className="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted hover:bg-surface">
          ✕
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mb-4 flex flex-col items-center text-center">
          {conv.kind === "cell" ? <CellGlyph size={72} /> : <Initials name={conv.title} size={72} />}
          <p className="mt-3 text-[19px] font-extrabold text-ink">{conv.title}</p>
          {conv.kind === "cell" ? (
            <p className="text-[14px] text-ink-muted">
              {conv.memberCount} members{conv.archived ? " · Archived" : ""}
            </p>
          ) : (
            other?.department && <p className="text-[14px] text-ink-muted">{other.department}</p>
          )}
          {conv.description && <p className="mt-2 whitespace-pre-wrap text-[14px] text-ink">{conv.description}</p>}
        </div>
        {tabs.length > 1 && (
          <div className="mb-4 flex gap-1 rounded-xl bg-surface p-1" role="tablist">
            {tabs.map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`flex-1 rounded-lg py-2 text-[14px] font-semibold capitalize ${tab === t ? "bg-white text-ink shadow-sm" : "text-ink-muted"}`}>
                {t}
              </button>
            ))}
          </div>
        )}
        {tab === "members" && conv.kind === "cell" && <CellMembers conv={conv} onChanged={onChanged} onLeft={onLeft} />}
        {tab === "files" && isMember && <FilesList conversationId={conv.id} />}
        {tab === "settings" && <CellSettings conv={conv} onChanged={onChanged} />}
      </div>
    </aside>
  );
}
