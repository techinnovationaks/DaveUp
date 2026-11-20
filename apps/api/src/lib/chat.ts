// Shared pieces of chat, cells, files and calls: access checks, message
// shapes, posting a message, and conversation summaries.
import { sql } from "kysely";
import type { ActiveCallDto, ConversationDetailDto, ConversationSummaryDto, FileDto, MessageDto } from "@daveup/shared";
import type { Tx } from "../db/pool";
import { forbidden, notFound } from "./errors";
import { publish } from "./realtime";

export type ConversationRow = {
  id: string;
  church_id: string;
  kind: "direct" | "cell";
  name: string | null;
  description: string | null;
  direct_key: string | null;
  created_by: string;
  created_at: Date;
  last_message_at: Date;
  archived_at: Date | null;
};

export type MemberRow = { role: "leader" | "member"; last_read_seq: string };

/**
 * Load a conversation the person belongs to. Anyone else gets "not found", so
 * nobody can probe which conversations exist. Church admins may also open a
 * cell they are not in, to manage it (but not read its messages).
 */
export async function loadConversation(
  tx: Tx,
  id: string,
  personId: string,
  opts: { adminMayManage?: boolean; isAdmin?: boolean; lock?: boolean } = {},
): Promise<{ conv: ConversationRow; member: MemberRow | null }> {
  let q = tx.selectFrom("conversation").selectAll().where("id", "=", id);
  if (opts.lock) q = q.forUpdate();
  const conv = await q.executeTakeFirst();
  if (!conv) throw notFound("Conversation not found");
  const member =
    (await tx.selectFrom("conversation_member").select(["role", "last_read_seq"]).where("conversation_id", "=", id).where("person_id", "=", personId).executeTakeFirst()) ?? null;
  if (!member && !(opts.adminMayManage && opts.isAdmin && conv.kind === "cell")) throw notFound("Conversation not found");
  return { conv, member };
}

/** Members only. */
export async function requireConversationMember(tx: Tx, id: string, personId: string) {
  const r = await loadConversation(tx, id, personId);
  return { conv: r.conv, member: r.member! };
}

export function requireWritable(conv: ConversationRow) {
  if (conv.archived_at) throw forbidden("This cell is archived. Messages can be read but not sent.");
}

/** Cell leaders and church admins manage a cell. */
export function canManageCell(member: MemberRow | null, isAdmin: boolean): boolean {
  return isAdmin || member?.role === "leader";
}

export function fileUrl(fileId: string): string {
  return `/api/files/${fileId}/download`;
}

function messageQuery(tx: Tx) {
  return tx
    .selectFrom("message as m")
    .leftJoin("person as s", "s.id", "m.sender_id")
    .leftJoin("shared_file as f", "f.id", "m.file_id")
    .leftJoin("person as fu", "fu.id", "f.uploader_id")
    .leftJoin("call_session as c", "c.id", "m.call_id")
    .select([
      "m.id",
      "m.seq",
      "m.conversation_id",
      "m.kind",
      "m.sender_id",
      "s.full_name as sender_name",
      "m.body",
      "m.created_at",
      "m.edited_at",
      "m.deleted_at",
      "f.id as file_id",
      "f.name as file_name",
      "f.mime as file_mime",
      "f.size_bytes as file_size",
      "f.status as file_status",
      "f.created_at as file_created_at",
      "fu.full_name as file_uploader",
      "c.id as call_id",
      "c.media as call_media",
      "c.answered_at as call_answered_at",
      "c.ended_at as call_ended_at",
    ]);
}

type MessageRow = Awaited<ReturnType<ReturnType<typeof messageQuery>["execute"]>>[number];

export function toMessageDto(r: MessageRow): MessageDto {
  const deleted = !!r.deleted_at;
  return {
    id: r.id,
    seq: Number(r.seq),
    conversationId: r.conversation_id,
    kind: r.kind,
    senderId: r.sender_id,
    senderName: r.sender_name ?? (r.sender_id ? "Former member" : null),
    body: deleted ? null : r.body,
    file:
      !deleted && r.file_id && r.file_status === "ready"
        ? {
            id: r.file_id,
            name: r.file_name!,
            mime: r.file_mime!,
            size: Number(r.file_size),
            uploaderName: r.file_uploader ?? "Member",
            createdAt: r.file_created_at!.toISOString(),
            url: fileUrl(r.file_id),
          }
        : null,
    call: r.call_id
      ? {
          id: r.call_id,
          media: r.call_media!,
          answered: !!r.call_answered_at,
          ended: !!r.call_ended_at,
          durationSeconds: r.call_answered_at && r.call_ended_at ? Math.max(0, Math.round((r.call_ended_at.getTime() - r.call_answered_at.getTime()) / 1000)) : null,
        }
      : null,
    createdAt: r.created_at.toISOString(),
    editedAt: r.edited_at?.toISOString() ?? null,
    deleted,
  };
}

export async function loadMessages(tx: Tx, conversationId: string, opts: { before?: number; after?: number; limit: number }): Promise<{ rows: MessageDto[]; hasMore: boolean }> {
  let q = messageQuery(tx).where("m.conversation_id", "=", conversationId);
  if (opts.after !== undefined) {
    const rows = await q.where("m.seq", ">", String(opts.after)).orderBy("m.seq", "asc").limit(opts.limit + 1).execute();
    return { rows: rows.slice(0, opts.limit).map(toMessageDto), hasMore: rows.length > opts.limit };
  }
  if (opts.before !== undefined) q = q.where("m.seq", "<", String(opts.before));
  const rows = await q.orderBy("m.seq", "desc").limit(opts.limit + 1).execute();
  return { rows: rows.slice(0, opts.limit).reverse().map(toMessageDto), hasMore: rows.length > opts.limit };
}

export async function loadMessage(tx: Tx, id: string): Promise<MessageDto | null> {
  const r = await messageQuery(tx).where("m.id", "=", id).executeTakeFirst();
  return r ? toMessageDto(r) : null;
}

/**
 * Post a message: store it, move the conversation to the top, mark it read
 * for the sender, and tell everyone in the conversation once committed.
 */
export async function postMessage(
  tx: Tx,
  m: {
    churchId: string;
    conversationId: string;
    senderId: string | null;
    kind: "text" | "file" | "call" | "system";
    body?: string | null;
    fileId?: string | null;
    callId?: string | null;
    data?: Record<string, unknown>;
  },
): Promise<{ id: string; seq: number }> {
  const row = await tx
    .insertInto("message")
    .values({
      church_id: m.churchId,
      conversation_id: m.conversationId,
      sender_id: m.senderId,
      kind: m.kind,
      body: m.body ?? null,
      file_id: m.fileId ?? null,
      call_id: m.callId ?? null,
      data: JSON.stringify(m.data ?? {}),
    })
    .returning(["id", "seq"])
    .executeTakeFirstOrThrow();
  await tx.updateTable("conversation").set({ last_message_at: new Date() }).where("id", "=", m.conversationId).execute();
  if (m.senderId) {
    await tx
      .updateTable("conversation_member")
      .set({ last_read_seq: sql`greatest(last_read_seq, ${row.seq}::bigint)` as unknown as string })
      .where("conversation_id", "=", m.conversationId)
      .where("person_id", "=", m.senderId)
      .execute();
  }
  await publish(tx, { churchId: m.churchId, conversationId: m.conversationId, event: { type: "message", conversationId: m.conversationId, seq: Number(row.seq), senderId: m.senderId } });
  return { id: row.id, seq: Number(row.seq) };
}

/** Short system note in a conversation, e.g. "Grace added Paul". */
export function systemMessage(tx: Tx, churchId: string, conversationId: string, body: string, data: Record<string, unknown> = {}) {
  return postMessage(tx, { churchId, conversationId, senderId: null, kind: "system", body, data });
}

export function namesList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length <= 3) return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `${names.slice(0, 2).join(", ")} and ${names.length - 2} others`;
}

export async function personName(tx: Tx, personId: string): Promise<string> {
  const p = await tx.selectFrom("person").select("full_name").where("id", "=", personId).executeTakeFirst();
  return p?.full_name ?? "Someone";
}

export async function activeCalls(tx: Tx, conversationIds: string[]): Promise<Map<string, ActiveCallDto>> {
  const out = new Map<string, ActiveCallDto>();
  if (conversationIds.length === 0) return out;
  const rows = await tx
    .selectFrom("call_session as c")
    .innerJoin("person as p", "p.id", "c.started_by")
    .select([
      "c.id",
      "c.conversation_id",
      "c.media",
      "c.started_by",
      "p.full_name",
      "c.started_at",
      (eb) =>
        eb
          .selectFrom("call_participant as cp")
          .select((e) => e.fn.countAll<string>().as("n"))
          .whereRef("cp.call_id", "=", "c.id")
          .where("cp.left_at", "is", null)
          .as("participants"),
    ])
    .where("c.conversation_id", "in", conversationIds)
    .where("c.ended_at", "is", null)
    .execute();
  for (const r of rows) {
    out.set(r.conversation_id, {
      id: r.id,
      media: r.media,
      startedBy: r.started_by,
      startedByName: r.full_name ?? "Someone",
      startedAt: r.started_at.toISOString(),
      participantCount: Number(r.participants ?? 0),
    });
  }
  return out;
}

function preview(m: { kind: string; body: string | null; deleted_at: Date | null; file_name: string | null; call_media: string | null }): string {
  if (m.deleted_at) return "Message deleted";
  if (m.kind === "file") return m.body ? `📎 ${m.body}` : `📎 ${m.file_name ?? "File"}`;
  if (m.kind === "call") return m.call_media === "video" ? "Video call" : "Voice call";
  return (m.body ?? "").slice(0, 140);
}

/** Summaries of conversations for one person, newest activity first. */
export async function summaries(tx: Tx, personId: string, onlyIds?: string[]): Promise<ConversationSummaryDto[]> {
  let q = tx
    .selectFrom("conversation as c")
    .innerJoin("conversation_member as cm", (j) => j.onRef("cm.conversation_id", "=", "c.id").on("cm.person_id", "=", personId))
    .select(["c.id", "c.kind", "c.name", "c.description", "c.last_message_at", "c.archived_at", "cm.role", "cm.last_read_seq"])
    .orderBy("c.last_message_at", "desc");
  if (onlyIds) {
    if (onlyIds.length === 0) return [];
    q = q.where("c.id", "in", onlyIds);
  }
  const convs = await q.execute();
  if (convs.length === 0) return [];
  const ids = convs.map((c) => c.id);

  const [unread, last, members, calls] = await Promise.all([
    tx
      .selectFrom("message as m")
      .innerJoin("conversation_member as cm", (j) => j.onRef("cm.conversation_id", "=", "m.conversation_id").on("cm.person_id", "=", personId))
      .select(["m.conversation_id", (e) => e.fn.countAll<string>().as("n")])
      .where("m.conversation_id", "in", ids)
      .whereRef("m.seq", ">", "cm.last_read_seq")
      .where("m.deleted_at", "is", null)
      .where((e) => e.or([e("m.sender_id", "is", null), e("m.sender_id", "!=", personId)]))
      .where("m.kind", "!=", "system")
      .groupBy("m.conversation_id")
      .execute(),
    tx
      .selectFrom("message as m")
      .leftJoin("person as s", "s.id", "m.sender_id")
      .leftJoin("shared_file as f", "f.id", "m.file_id")
      .leftJoin("call_session as cs", "cs.id", "m.call_id")
      .distinctOn("m.conversation_id")
      .select(["m.conversation_id", "m.kind", "m.body", "m.deleted_at", "m.created_at", "s.full_name as sender_name", "f.name as file_name", "cs.media as call_media"])
      .where("m.conversation_id", "in", ids)
      .orderBy("m.conversation_id")
      .orderBy("m.seq", "desc")
      .execute(),
    tx
      .selectFrom("conversation_member as cm")
      .innerJoin("person as p", "p.id", "cm.person_id")
      .select(["cm.conversation_id", "cm.person_id", "p.full_name"])
      .where("cm.conversation_id", "in", ids)
      .execute(),
    activeCalls(tx, ids),
  ]);

  return convs.map((c) => {
    const mine = members.filter((m) => m.conversation_id === c.id);
    const other = c.kind === "direct" ? mine.find((m) => m.person_id !== personId) : undefined;
    const lm = last.find((l) => l.conversation_id === c.id);
    return {
      id: c.id,
      kind: c.kind,
      title: c.kind === "cell" ? c.name! : (other?.full_name ?? "Former member"),
      otherPersonId: other?.person_id ?? null,
      description: c.description,
      memberCount: mine.length,
      myRole: c.role,
      unread: Number(unread.find((u) => u.conversation_id === c.id)?.n ?? 0),
      lastMessage: lm ? { preview: preview(lm), senderName: lm.kind === "system" ? null : lm.sender_name, at: lm.created_at.toISOString() } : null,
      lastMessageAt: c.last_message_at.toISOString(),
      archived: !!c.archived_at,
      activeCall: calls.get(c.id) ?? null,
    };
  });
}

/** Everything the conversation screen needs about one conversation. */
export async function detail(tx: Tx, conv: ConversationRow, member: MemberRow | null, personId: string, isAdmin: boolean): Promise<ConversationDetailDto> {
  const people = await tx
    .selectFrom("conversation_member as cm")
    .innerJoin("person as p", "p.id", "cm.person_id")
    .leftJoin("membership as ms", (j) => j.onRef("ms.person_id", "=", "cm.person_id").on("ms.status", "=", "approved"))
    .select(["cm.person_id", "cm.role", "p.full_name", "ms.department", "ms.id as membership_id"])
    .where("cm.conversation_id", "=", conv.id)
    .orderBy("cm.role")
    .orderBy("p.full_name")
    .execute();

  let base: ConversationSummaryDto;
  if (member) {
    base = (await summaries(tx, personId, [conv.id]))[0]!;
  } else {
    // A church admin managing a cell they are not in.
    const calls = await activeCalls(tx, [conv.id]);
    base = {
      id: conv.id,
      kind: conv.kind,
      title: conv.name ?? "Cell",
      otherPersonId: null,
      description: conv.description,
      memberCount: people.length,
      myRole: "member",
      unread: 0,
      lastMessage: null,
      lastMessageAt: conv.last_message_at.toISOString(),
      archived: !!conv.archived_at,
      activeCall: calls.get(conv.id) ?? null,
    };
  }
  const other = conv.kind === "direct" ? people.find((p) => p.person_id !== personId) : undefined;
  return {
    ...base,
    members: people.map((p) => ({ personId: p.person_id, fullName: p.full_name ?? "Member", role: p.role, department: p.department ?? null })),
    canManage: conv.kind === "cell" && canManageCell(member, isAdmin),
    readOnly: conv.kind === "direct" ? !other?.membership_id : !!conv.archived_at,
  };
}

export type { FileDto };
