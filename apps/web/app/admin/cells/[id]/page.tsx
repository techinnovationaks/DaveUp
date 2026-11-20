"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use } from "react";
import type { ConversationDetailDto } from "@daveup/shared";
import { ConsoleScreen } from "@/components/ConsoleShell";
import { CellMembers } from "@/components/chat/InfoPanel";
import { CellGlyph } from "@/components/chat/kit";
import { Button, Card, ErrorText, Loading, Pill, TopBar } from "@/components/ui";
import { api, useAction, useApi } from "@/lib/api";
import { useGuard } from "@/lib/session";

/** Church console: one cell's members and status. Messages stay private to the cell. */
export default function AdminCell({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { me, ready } = useGuard("admin");
  const cell = useApi<ConversationDetailDto>(ready ? `/conversations/${id}` : null);
  const { busy, error, run } = useAction();
  const router = useRouter();

  if (!ready || cell.loading) return <Loading />;
  const c = cell.data;
  if (!c) {
    return (
      <ConsoleScreen narrow>
        <TopBar back="/admin/cells" />
        <ErrorText>{cell.error?.message ?? "Cell not found"}</ErrorText>
      </ConsoleScreen>
    );
  }
  const amMember = c.members.some((m) => m.personId === me?.person.id);

  return (
    <ConsoleScreen narrow>
      <TopBar back="/admin/cells" title="Cell" />
      <div className="mb-6 flex items-center gap-4">
        <CellGlyph size={64} />
        <div className="min-w-0">
          <h1 className="text-[26px] font-extrabold leading-tight text-ink">{c.title}</h1>
          <p className="text-[15px] text-ink-muted">
            {c.memberCount} members {c.archived && <Pill>Archived</Pill>}
          </p>
        </div>
      </div>
      {c.description && <p className="mb-6 whitespace-pre-wrap text-[15px] text-ink">{c.description}</p>}
      <ErrorText>{error}</ErrorText>

      <Card className="mb-4">
        <p className="mb-3 text-[17px] font-bold text-ink">Members</p>
        <CellMembers conv={c} onChanged={cell.setData} />
      </Card>

      <Card className="mb-4">
        <p className="text-[17px] font-bold text-ink">Chat and files</p>
        <p className="mt-1 text-[14px] text-ink-muted">
          {amMember ? "You are in this cell." : "Only the cell's members can read its messages and files. Add yourself if you want to take part."}
        </p>
        {amMember && (
          <Link href={`/messages/${c.id}`} className="mt-3 inline-block font-bold text-brand">
            Open the cell chat →
          </Link>
        )}
      </Card>

      <Card>
        <p className="text-[17px] font-bold text-ink">{c.archived ? "Reopen this cell" : "Archive this cell"}</p>
        <p className="mt-1 text-[14px] text-ink-muted">
          {c.archived ? "Members can send messages and start calls again." : "Members keep read access to messages and files, but no one can post. You can reopen it at any time."}
        </p>
        <Button
          className="mt-4"
          variant={c.archived ? "secondary" : "danger"}
          disabled={busy}
          onClick={() => {
            if (!c.archived && !confirm(`Archive ${c.title}?`)) return;
            void run(async () => {
              cell.setData(await api<ConversationDetailDto>(`/cells/${c.id}/${c.archived ? "unarchive" : "archive"}`, { method: "POST" }));
              router.refresh();
            });
          }}
        >
          {c.archived ? "Reopen cell" : "Archive cell"}
        </Button>
      </Card>
    </ConsoleScreen>
  );
}
