"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { CellAdminDto, ConversationDetailDto, DirectoryPersonDto } from "@daveup/shared";
import { ConsoleScreen } from "@/components/ConsoleShell";
import { CellGlyph, PeoplePicker, shortWhen } from "@/components/chat/kit";
import { Button, Card, ErrorText, Field, H1, Loading, Pill, inputClass } from "@/components/ui";
import { api, useAction, useApi } from "@/lib/api";
import { useGuard, useSession } from "@/lib/session";

/** Church console: every cell in the church, and creating new ones. */
export default function AdminCells() {
  const { ready } = useGuard("admin");
  const cells = useApi<CellAdminDto[]>(ready ? "/cells" : null);
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState("");
  const shown = useMemo(() => (cells.data ?? []).filter((c) => !q.trim() || c.name.toLowerCase().includes(q.trim().toLowerCase())), [cells.data, q]);

  if (!ready) return <Loading />;
  return (
    <ConsoleScreen>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <H1 sub="Cells are small groups with their own chat, shared files and group calls. You choose each cell's leaders; leaders can then add and remove members.">Cells</H1>
        {!creating && <Button onClick={() => setCreating(true)}>Create a cell</Button>}
      </div>

      {creating && (
        <CreateCell
          onCancel={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            void cells.reload();
          }}
        />
      )}

      {cells.loading ? (
        <Loading />
      ) : cells.error ? (
        <ErrorText>{cells.error.message}</ErrorText>
      ) : (cells.data ?? []).length === 0 ? (
        !creating && (
          <Card tone="dashed" className="text-center">
            <p className="text-[17px] font-bold text-ink">No cells yet</p>
            <p className="mt-1 text-[15px] text-ink-muted">Create your first cell and choose its leader.</p>
          </Card>
        )
      ) : (
        <>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search cells" className={`${inputClass} mb-4 md:max-w-sm`} aria-label="Search cells" />
          <Card className="!p-0">
            <ul className="divide-y divide-surface-line">
              {shown.map((c) => (
                <li key={c.id}>
                  <Link href={`/admin/cells/${c.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-surface">
                    <CellGlyph size={44} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[16px] font-bold text-ink">{c.name}</span>
                        {c.archived && <Pill>Archived</Pill>}
                      </span>
                      <span className="block truncate text-[14px] text-ink-muted">
                        {c.memberCount} members · Led by {c.leaders.map((l) => l.fullName).join(", ") || "nobody"}
                      </span>
                    </span>
                    <span className="hidden text-right text-[13px] text-ink-muted md:block">Active {shortWhen(c.lastMessageAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </ConsoleScreen>
  );
}

function CreateCell({ onCancel, onCreated }: { onCancel: () => void; onCreated: (c: ConversationDetailDto) => void }) {
  const router = useRouter();
  const directory = useApi<DirectoryPersonDto[]>("/people/directory");
  const org = useApi<{ owner: { personId: string; fullName: string } | null }>("/church");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [leaders, setLeaders] = useState<string[]>([]);
  const [members, setMembers] = useState<string[]>([]);
  const [picking, setPicking] = useState<"leaders" | "members" | null>(null);
  const { busy, error, run } = useAction();
  const { me } = useSession();
  const owner = org.data?.owner ?? null;
  // The organization's owner leads new cells unless the admin chooses otherwise.
  const [leadersTouched, setLeadersTouched] = useState(false);
  useEffect(() => {
    if (owner && !leadersTouched) setLeaders([owner.personId]);
  }, [owner, leadersTouched]);
  const nameOf = (id: string) => (id === me?.person.id ? "You" : (directory.data?.find((p) => p.personId === id)?.fullName ?? (id === owner?.personId ? owner.fullName : "Member")));

  const create = () =>
    run(async () => {
      const c = await api<ConversationDetailDto>("/cells", { method: "POST", body: { name: name.trim(), description: description.trim(), leaderIds: leaders, memberIds: members } });
      onCreated(c);
      router.push(`/admin/cells/${c.id}`);
    });

  const chips = (ids: string[], remove: (id: string) => void) => (
    <div className="flex flex-wrap gap-2">
      {ids.map((id) => (
        <span key={id} className="flex items-center gap-1.5 rounded-full bg-brand-soft py-1 pl-3 pr-1.5 text-[14px] font-semibold text-brand">
          {nameOf(id)}
          <button onClick={() => remove(id)} aria-label={`Remove ${nameOf(id)}`} className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-white">
            ✕
          </button>
        </span>
      ))}
    </div>
  );

  return (
    <Card className="mb-6 md:max-w-2xl">
      <p className="mb-4 text-[18px] font-extrabold text-ink">New cell</p>
      <ErrorText>{error}</ErrorText>
      <Field label="Cell name">
        <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="For example: Youth cell, Ikot Ekpene" />
      </Field>
      <Field label="Description (optional)" hint="When and where the cell meets, or what it is for.">
        <textarea value={description} maxLength={500} rows={2} onChange={(e) => setDescription(e.target.value)} className={inputClass} />
      </Field>
      <div className="mb-4">
        <p className="mb-1.5 text-[14px] font-semibold text-ink">Leaders</p>
        {chips(leaders, (id) => (setLeadersTouched(true), setLeaders((l) => l.filter((x) => x !== id))))}
        <button onClick={() => setPicking("leaders")} className="mt-2 text-[14px] font-bold text-brand">
          + Choose leaders
        </button>
        {owner && <p className="mt-1 text-[13px] text-ink-muted">{owner.personId === me?.person.id ? "You lead" : `${owner.fullName} leads`} new cells unless you choose someone else.</p>}
      </div>
      <div className="mb-6">
        <p className="mb-1.5 text-[14px] font-semibold text-ink">Members (optional)</p>
        {chips(members, (id) => setMembers((l) => l.filter((x) => x !== id)))}
        <button onClick={() => setPicking("members")} className="mt-2 text-[14px] font-bold text-brand">
          + Add members
        </button>
        <p className="mt-1 text-[13px] text-ink-muted">Leaders can add more people later.</p>
      </div>
      <div className="flex flex-col gap-3 md:flex-row">
        <Button disabled={busy || name.trim().length < 2 || leaders.length === 0} onClick={() => void create()}>
          {busy ? "Creating…" : "Create cell"}
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      {picking && (
        <PeoplePicker
          title={picking === "leaders" ? "Choose leaders" : "Add members"}
          multiple
          confirmLabel={picking === "leaders" ? "Choose" : "Add"}
          exclude={[...leaders, ...members]}
          onPick={(ids) => {
            if (picking === "leaders") (setLeadersTouched(true), setLeaders((l) => [...l, ...ids]));
            else setMembers((m) => [...m, ...ids]);
            setPicking(null);
          }}
          onClose={() => setPicking(null)}
        />
      )}
    </Card>
  );
}
