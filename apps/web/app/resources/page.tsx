"use client";
// Resource Centre: documents, videos and links from DaveUp and your organization.
import { useMemo, useState } from "react";
import { RESOURCE_CATEGORIES, type LibraryFileDto, type LibraryScope, type ResourceDto, type ResourceKind, type ResourceListDto } from "@daveup/shared";
import { Screen, Button, Card, ErrorText, Field, H1, Loading, Segmented, inputClass } from "@/components/ui";
import { Modal } from "@/components/chat/kit";
import { FilePicker, ScopeBadge, ScopePicker, VideoEmbed, defaultScope, sizeLabel } from "@/components/library/kit";
import { api, useAction, useApi } from "@/lib/api";
import { useGuard } from "@/lib/session";

const KIND_LABEL: Record<ResourceKind, string> = { file: "Document", video: "Video", link: "Link" };

function KindIcon({ kind }: { kind: ResourceKind }) {
  const d =
    kind === "video"
      ? "M23 7l-7 5 7 5V7zM3 5h11a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"
      : kind === "link"
        ? "M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"
        : "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM14 2v6h6M8 13h8M8 17h5";
  return (
    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-brand">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={d} />
      </svg>
    </span>
  );
}

function ResourceForm({ list, editing, onClose, onSaved }: { list: ResourceListDto; editing: ResourceDto | null; onClose: () => void; onSaved: (r: ResourceDto) => void }) {
  const [scope, setScope] = useState<LibraryScope>(editing?.scope ?? defaultScope(list.rights));
  const [kind, setKind] = useState<ResourceKind>(editing?.kind ?? "file");
  const [title, setTitle] = useState(editing?.title ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [category, setCategory] = useState(editing?.category ?? "General");
  const [url, setUrl] = useState(editing?.url ?? "");
  const [file, setFile] = useState<LibraryFileDto | null>(editing?.file ?? null);
  const { busy, error, run } = useAction();
  const ready = title.trim() && (kind === "file" ? !!file : url.trim());
  const save = () =>
    run(async () => {
      const body = { title, description: description || null, category, kind, url: kind === "file" ? null : url.trim(), fileId: kind === "file" ? file?.id : null, scope };
      onSaved(editing ? await api<ResourceDto>(`/resources/${editing.id}`, { method: "PUT", body }) : await api<ResourceDto>("/resources", { method: "POST", body }));
    });
  return (
    <Modal
      title={editing ? "Edit resource" : "Add a resource"}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <Button disabled={busy || !ready} onClick={() => void save()}>
            {busy ? "Saving…" : editing ? "Save changes" : "Add resource"}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      }
    >
      {!editing && <ScopePicker rights={list.rights} value={scope} onChange={setScope} />}
      <Segmented<ResourceKind>
        value={kind}
        onChange={setKind}
        options={[
          { value: "file", label: "Document" },
          { value: "video", label: "Video" },
          { value: "link", label: "Link" },
        ]}
      />
      <Field label="Title">
        <input className={inputClass} value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      {kind === "file" ? (
        <div className="mb-4">
          <p className="mb-1.5 text-[14px] font-semibold text-ink">File</p>
          <FilePicker scope={editing?.scope ?? scope} value={file} onChange={setFile} />
        </div>
      ) : (
        <Field label={kind === "video" ? "Video address" : "Web address"} hint={kind === "video" ? "YouTube and Vimeo videos play inside DaveUp." : undefined}>
          <input className={inputClass} type="url" inputMode="url" placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} />
        </Field>
      )}
      <Field label="Category">
        <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
          {[...new Set([...RESOURCE_CATEGORIES, category])].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </Field>
      <Field label="Description (optional)">
        <textarea className={`${inputClass} min-h-[90px] py-3`} value={description} maxLength={2000} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <ErrorText>{error}</ErrorText>
    </Modal>
  );
}

function Item({ r, orgName, onWatch, onEdit, onDelete }: { r: ResourceDto; orgName: string | null; onWatch: () => void; onEdit: () => void; onDelete: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const open =
    r.kind === "file" && r.file ? (
      <a href={`${r.file.url}?inline=1`} target="_blank" rel="noopener" className="rounded-xl bg-brand px-4 py-2 text-[14px] font-bold text-white hover:bg-brand-dark">
        Open
      </a>
    ) : r.kind === "video" ? (
      <button onClick={onWatch} className="rounded-xl bg-brand px-4 py-2 text-[14px] font-bold text-white hover:bg-brand-dark">
        Watch
      </button>
    ) : (
      <a href={r.url!} target="_blank" rel="noopener noreferrer" className="rounded-xl bg-brand px-4 py-2 text-[14px] font-bold text-white hover:bg-brand-dark">
        Visit ↗
      </a>
    );
  return (
    <Card className="flex flex-col">
      <div className="flex items-start gap-3">
        <KindIcon kind={r.kind} />
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <ScopeBadge scope={r.scope} orgName={orgName} />
            <span className="text-[12px] font-semibold uppercase tracking-wide text-ink-faint">
              {KIND_LABEL[r.kind]}
              {r.file ? ` · ${sizeLabel(r.file.size)}` : ""}
            </span>
          </div>
          <h3 className="text-[17px] font-bold leading-snug text-ink">{r.title}</h3>
          {r.description && <p className="mt-1 line-clamp-3 text-[14px] text-ink-muted">{r.description}</p>}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {open}
        {r.kind === "file" && r.file && (
          <a href={r.file.url} className="rounded-xl px-3 py-2 text-[14px] font-semibold text-brand hover:bg-brand-soft">
            Download
          </a>
        )}
        <span className="flex-1" />
        {r.canEdit &&
          (confirm ? (
            <>
              <button onClick={onDelete} className="rounded-xl px-3 py-2 text-[14px] font-bold text-danger hover:bg-danger-soft">
                Remove
              </button>
              <button onClick={() => setConfirm(false)} className="rounded-xl px-3 py-2 text-[14px] font-semibold text-ink-muted hover:bg-surface">
                Keep
              </button>
            </>
          ) : (
            <>
              <button onClick={onEdit} className="rounded-xl px-3 py-2 text-[14px] font-semibold text-ink-muted hover:bg-surface">
                Edit
              </button>
              <button onClick={() => setConfirm(true)} className="rounded-xl px-3 py-2 text-[14px] font-semibold text-ink-muted hover:bg-surface">
                Remove
              </button>
            </>
          ))}
      </div>
    </Card>
  );
}

export default function Resources() {
  const { ready } = useGuard("library");
  const list = useApi<ResourceListDto>(ready ? "/resources" : null);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [form, setForm] = useState<{ editing: ResourceDto | null } | null>(null);
  const [watching, setWatching] = useState<ResourceDto | null>(null);
  const { error, run } = useAction();

  const data = list.data;
  const categories = useMemo(() => [...new Set((data?.resources ?? []).map((r) => r.category))].sort(), [data]);
  if (!ready || list.loading || !data) return <Loading />;

  const term = q.trim().toLowerCase();
  const shown = data.resources.filter((r) => (!cat || r.category === cat) && (!term || `${r.title} ${r.description ?? ""} ${r.category}`.toLowerCase().includes(term)));
  const grouped = new Map<string, ResourceDto[]>();
  for (const r of shown) grouped.set(r.category, [...(grouped.get(r.category) ?? []), r]);
  const canAdd = data.rights.org || data.rights.daveup;

  const saved = (r: ResourceDto) => {
    const exists = data.resources.some((x) => x.id === r.id);
    list.setData({ ...data, resources: exists ? data.resources.map((x) => (x.id === r.id ? r : x)) : [r, ...data.resources] });
    setForm(null);
  };
  const remove = (r: ResourceDto) =>
    run(async () => {
      await api(`/resources/${r.id}`, { method: "DELETE" });
      list.setData({ ...data, resources: data.resources.filter((x) => x.id !== r.id) });
    });

  return (
    <Screen nav>
      <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
        <H1 sub="Studies, guides, videos and links from DaveUp and your organization.">Resource Centre</H1>
        {canAdd && <Button onClick={() => setForm({ editing: null })}>Add resource</Button>}
      </div>
      <input className={`${inputClass} mb-3`} type="search" placeholder="Search resources" value={q} onChange={(e) => setQ(e.target.value)} />
      {categories.length > 1 && (
        <div className="mb-6 flex gap-2 overflow-x-auto pb-1">
          {[null, ...categories].map((c) => (
            <button
              key={c ?? "all"}
              onClick={() => setCat(c)}
              className={`shrink-0 rounded-full px-4 py-2 text-[14px] font-semibold ${cat === c ? "bg-brand text-white" : "border border-surface-line bg-white text-ink hover:border-brand-line"}`}
            >
              {c ?? "All"}
            </button>
          ))}
        </div>
      )}
      <ErrorText>{error}</ErrorText>
      {data.resources.length === 0 ? (
        <Card tone="soft">
          <p className="text-[16px] text-ink">{canAdd ? "Nothing here yet. Add the first study guide, video or link for your people." : "Resources from DaveUp and your organization will appear here."}</p>
        </Card>
      ) : shown.length === 0 ? (
        <p className="py-6 text-center text-[15px] text-ink-muted">Nothing matches your search.</p>
      ) : (
        [...grouped].map(([c, items]) => (
          <section key={c} className="mb-8">
            <h2 className="mb-3 text-[18px] font-extrabold text-ink">{c}</h2>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {items.map((r) => (
                <Item key={r.id} r={r} orgName={data.rights.orgName} onWatch={() => setWatching(r)} onEdit={() => setForm({ editing: r })} onDelete={() => void remove(r)} />
              ))}
            </div>
          </section>
        ))
      )}
      {form && <ResourceForm list={data} editing={form.editing} onClose={() => setForm(null)} onSaved={saved} />}
      {watching && (
        <Modal title={watching.title} onClose={() => setWatching(null)} wide>
          <VideoEmbed url={watching.url!} title={watching.title} />
          {watching.description && <p className="mt-4 text-[15px] text-ink">{watching.description}</p>}
        </Modal>
      )}
    </Screen>
  );
}
