// Chat: direct messages between members of the same church, and the shared
// chat of each cell. Conversations, messages, read markers.
import type { FastifyInstance } from "fastify";
import { sql } from "kysely";
import { z } from "zod";
import {
  DirectChatSchema,
  EditMessageSchema,
  FILE_MAX_BYTES,
  MarkReadSchema,
  MESSAGES_PAGE,
  SendMessageSchema,
  type ChatFeaturesDto,
  type ConversationDetailDto,
  type ConversationSummaryDto,
  type DirectoryPersonDto,
  type MessageDto,
  type MessagesPageDto,
} from "@daveup/shared";
import { withTenant } from "../db/pool";
import { detail, loadConversation, loadMessage, loadMessages, postMessage, requireConversationMember, requireWritable, summaries } from "../lib/chat";
import { requireMember } from "../lib/context";
import { badRequest, forbidden, notFound, parse } from "../lib/errors";
import { livekitEnabled } from "../lib/livekit";
import { publish } from "../lib/realtime";
import { getStorage } from "../lib/storage";

const IdParam = z.object({ id: z.string().uuid() });
const PageQuery = z.object({
  before: z.coerce.number().int().positive().optional(),
  after: z.coerce.number().int().min(0).optional(),
});
const DirectoryQuery = z.object({ q: z.string().trim().max(80).optional() });
/** Messages can be edited for this long after sending. */
const EDIT_HOURS = 24;

export async function chatRoutes(app: FastifyInstance) {
  /** What this server can do, so the app hides buttons that would not work. */
  app.get("/chat/features", async (req): Promise<ChatFeaturesDto> => {
    await requireMember(req);
    return { calls: livekitEnabled(), files: getStorage() !== null, fileMaxBytes: FILE_MAX_BYTES };
  });

  /** Approved members of my church, to start a chat or add to a cell. */
  app.get("/people/directory", async (req): Promise<DirectoryPersonDto[]> => {
    const ctx = await requireMember(req);
    const { q } = parse(DirectoryQuery, req.query);
    return withTenant(ctx.membership.churchId, async (tx) => {
      let query = tx
        .selectFrom("membership as ms")
        .innerJoin("person as p", "p.id", "ms.person_id")
        .select(["p.id", "p.full_name", "ms.department", "ms.is_admin"])
        .where("ms.status", "=", "approved")
        .where("p.id", "!=", ctx.personId)
        .where("p.full_name", "is not", null)
        .orderBy("p.full_name")
        .limit(q ? 50 : 500);
      if (q) query = query.where("p.full_name", "ilike", `%${q.replace(/[\\%_]/g, (c) => "\\" + c)}%`);
      const rows = await query.execute();
      return rows.map((r) => ({ personId: r.id, fullName: r.full_name!, department: r.department, isAdmin: r.is_admin }));
    });
  });

  app.get("/conversations", async (req): Promise<ConversationSummaryDto[]> => {
    const ctx = await requireMember(req);
    return withTenant(ctx.membership.churchId, (tx) => summaries(tx, ctx.personId));
  });

  /** Total unread, for the badge in the navigation. */
  app.get("/conversations/unread", async (req): Promise<{ total: number }> => {
    const ctx = await requireMember(req);
    return withTenant(ctx.membership.churchId, async (tx) => {
      const r = await tx
        .selectFrom("message as m")
        .innerJoin("conversation_member as cm", (j) => j.onRef("cm.conversation_id", "=", "m.conversation_id").on("cm.person_id", "=", ctx.personId))
        .select((e) => e.fn.countAll<string>().as("n"))
        .whereRef("m.seq", ">", "cm.last_read_seq")
        .where("m.deleted_at", "is", null)
        .where("m.kind", "!=", "system")
        .where((e) => e.or([e("m.sender_id", "is", null), e("m.sender_id", "!=", ctx.personId)]))
        .executeTakeFirst();
      return { total: Number(r?.n ?? 0) };
    });
  });

  /** Open (or start) the direct chat with another member of my church. */
  app.post("/conversations/direct", async (req): Promise<ConversationDetailDto> => {
    const ctx = await requireMember(req);
    const { personId } = parse(DirectChatSchema, req.body);
    if (personId === ctx.personId) throw badRequest("SELF", "You cannot start a chat with yourself");
    const churchId = ctx.membership.churchId;
    return withTenant(churchId, async (tx) => {
      const other = await tx.selectFrom("membership").select("id").where("person_id", "=", personId).where("status", "=", "approved").executeTakeFirst();
      if (!other) throw notFound("That person is not a member of your church");
      const key = [ctx.personId, personId].sort().join(":");
      let conv = await tx.selectFrom("conversation").select("id").where("direct_key", "=", key).executeTakeFirst();
      if (!conv) {
        // If both people open the chat at the same moment, one insert wins and the other reads it.
        const created = await tx
          .insertInto("conversation")
          .values({ church_id: churchId, kind: "direct", direct_key: key, created_by: ctx.personId })
          .onConflict((oc) => oc.columns(["church_id", "direct_key"]).where("direct_key", "is not", null).doNothing())
          .returning("id")
          .executeTakeFirst();
        if (created) {
          await tx
            .insertInto("conversation_member")
            .values([ctx.personId, personId].map((p) => ({ conversation_id: created.id, church_id: churchId, person_id: p, role: "member" as const, added_by: ctx.personId })))
            .execute();
          conv = created;
        } else {
          conv = await tx.selectFrom("conversation").select("id").where("direct_key", "=", key).executeTakeFirstOrThrow();
        }
      }
      const { conv: row, member } = await loadConversation(tx, conv.id, ctx.personId);
      return detail(tx, row, member, ctx.personId, ctx.membership.isAdmin);
    });
  });

  app.get("/conversations/:id", async (req): Promise<ConversationDetailDto> => {
    const ctx = await requireMember(req);
    const { id } = parse(IdParam, req.params);
    return withTenant(ctx.membership.churchId, async (tx) => {
      const { conv, member } = await loadConversation(tx, id, ctx.personId, { adminMayManage: true, isAdmin: ctx.membership.isAdmin });
      return detail(tx, conv, member, ctx.personId, ctx.membership.isAdmin);
    });
  });

  /** A page of messages: the latest, older than `before`, or newer than `after`. */
  app.get("/conversations/:id/messages", async (req): Promise<MessagesPageDto> => {
    const ctx = await requireMember(req);
    const { id } = parse(IdParam, req.params);
    const { before, after } = parse(PageQuery, req.query);
    return withTenant(ctx.membership.churchId, async (tx) => {
      await requireConversationMember(tx, id, ctx.personId);
      const { rows, hasMore } = await loadMessages(tx, id, { before, after, limit: after !== undefined ? 200 : MESSAGES_PAGE });
      return { messages: rows, hasMore };
    });
  });

  app.post("/conversations/:id/messages", async (req, reply): Promise<MessageDto> => {
    const ctx = await requireMember(req);
    const { id } = parse(IdParam, req.params);
    const body = parse(SendMessageSchema, req.body);
    const churchId = ctx.membership.churchId;
    const out = await withTenant(churchId, async (tx) => {
      const { conv } = await requireConversationMember(tx, id, ctx.personId);
      requireWritable(conv);
      await requireOtherStillMember(tx, conv, ctx.personId);
      if (body.clientId) {
        // A retried send (for example after a dropped connection) is not posted twice.
        const dup = await tx
          .selectFrom("message")
          .select("id")
          .where("conversation_id", "=", id)
          .where("sender_id", "=", ctx.personId)
          .where(sql<string>`data->>'clientId'`, "=", body.clientId)
          .executeTakeFirst();
        if (dup) return (await loadMessage(tx, dup.id))!;
      }
      const m = await postMessage(tx, { churchId, conversationId: id, senderId: ctx.personId, kind: "text", body: body.body, data: body.clientId ? { clientId: body.clientId } : {} });
      return (await loadMessage(tx, m.id))!;
    });
    reply.code(201);
    return out;
  });

  /** One message (after an edit, delete or call update). */
  app.get("/messages/:id", async (req): Promise<MessageDto> => {
    const ctx = await requireMember(req);
    const { id } = parse(IdParam, req.params);
    return withTenant(ctx.membership.churchId, async (tx) => {
      const m = await tx.selectFrom("message").select("conversation_id").where("id", "=", id).executeTakeFirst();
      if (!m) throw notFound();
      await requireConversationMember(tx, m.conversation_id, ctx.personId);
      return (await loadMessage(tx, id))!;
    });
  });

  /** Edit your own message, for a day after sending. */
  app.patch("/messages/:id", async (req): Promise<MessageDto> => {
    const ctx = await requireMember(req);
    const { id } = parse(IdParam, req.params);
    const { body } = parse(EditMessageSchema, req.body);
    const churchId = ctx.membership.churchId;
    return withTenant(churchId, async (tx) => {
      const m = await tx.selectFrom("message").selectAll().where("id", "=", id).forUpdate().executeTakeFirst();
      if (!m) throw notFound();
      const { conv } = await requireConversationMember(tx, m.conversation_id, ctx.personId);
      requireWritable(conv);
      if (m.sender_id !== ctx.personId || m.kind !== "text" || m.deleted_at) throw forbidden("You can only edit your own messages");
      if (Date.now() - m.created_at.getTime() > EDIT_HOURS * 3_600_000) throw forbidden(`Messages can be edited for ${EDIT_HOURS} hours`);
      await tx.updateTable("message").set({ body, edited_at: new Date() }).where("id", "=", id).execute();
      await publish(tx, { churchId, conversationId: m.conversation_id, event: { type: "message.changed", conversationId: m.conversation_id, messageId: id } });
      return (await loadMessage(tx, id))!;
    });
  });

  /**
   * Delete a message: the sender can delete their own; in a cell, its leaders
   * and church admins can delete any message. The text is erased, and a shared
   * file is removed from storage.
   */
  app.delete("/messages/:id", async (req): Promise<MessageDto> => {
    const ctx = await requireMember(req);
    const { id } = parse(IdParam, req.params);
    const churchId = ctx.membership.churchId;
    let removeKey: string | null = null;
    const out = await withTenant(churchId, async (tx) => {
      const m = await tx.selectFrom("message").selectAll().where("id", "=", id).forUpdate().executeTakeFirst();
      if (!m) throw notFound();
      const { conv, member } = await requireConversationMember(tx, m.conversation_id, ctx.personId);
      const moderator = conv.kind === "cell" && (member.role === "leader" || ctx.membership.isAdmin);
      if (m.sender_id !== ctx.personId && !moderator) throw forbidden("You can only delete your own messages");
      if (m.kind === "system" || m.kind === "call") throw forbidden("This message cannot be deleted");
      if (!m.deleted_at) {
        await tx.updateTable("message").set({ deleted_at: new Date(), body: null }).where("id", "=", id).execute();
        if (m.file_id) {
          const f = await tx.updateTable("shared_file").set({ status: "deleted", deleted_at: new Date() }).where("id", "=", m.file_id).returning("storage_key").executeTakeFirst();
          removeKey = f?.storage_key ?? null;
        }
        await publish(tx, { churchId, conversationId: m.conversation_id, event: { type: "message.changed", conversationId: m.conversation_id, messageId: id } });
      }
      return (await loadMessage(tx, id))!;
    });
    if (removeKey) {
      await getStorage()
        ?.remove(removeKey)
        .catch((err) => req.log.warn({ err }, "could not remove a deleted file from storage"));
    }
    return out;
  });

  /** Mark read up to a message. */
  app.post("/conversations/:id/read", async (req): Promise<{ ok: true }> => {
    const ctx = await requireMember(req);
    const { id } = parse(IdParam, req.params);
    const { seq } = parse(MarkReadSchema, req.body);
    const churchId = ctx.membership.churchId;
    await withTenant(churchId, async (tx) => {
      await requireConversationMember(tx, id, ctx.personId);
      const r = await tx
        .updateTable("conversation_member")
        .set({ last_read_seq: sql`greatest(last_read_seq, least(${seq}::bigint, (select coalesce(max(seq), 0) from message where conversation_id = ${id})))` as unknown as string })
        .where("conversation_id", "=", id)
        .where("person_id", "=", ctx.personId)
        .returning("last_read_seq")
        .executeTakeFirstOrThrow();
      // Other tabs and devices of the same person clear their badges too.
      await publish(tx, { churchId, to: [ctx.personId], event: { type: "read", conversationId: id, personId: ctx.personId, seq: Number(r.last_read_seq) } });
    });
    return { ok: true };
  });
}

/** In a direct chat, both people must still be members of the church. */
async function requireOtherStillMember(tx: Parameters<typeof detail>[0], conv: { kind: string; id: string }, personId: string) {
  if (conv.kind !== "direct") return;
  const other = await tx
    .selectFrom("conversation_member as cm")
    .leftJoin("membership as ms", (j) => j.onRef("ms.person_id", "=", "cm.person_id").on("ms.status", "=", "approved"))
    .select("ms.id")
    .where("cm.conversation_id", "=", conv.id)
    .where("cm.person_id", "!=", personId)
    .executeTakeFirst();
  if (!other?.id) throw forbidden("This person is no longer a member of your church");
}
