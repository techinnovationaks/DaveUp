// Cells: small groups inside a church, each with a shared chat, shared files
// and group calls. Church admins create cells and choose their leaders;
// leaders and admins add and remove members. Members can leave.
import type { FastifyInstance } from "fastify";
import { sql } from "kysely";
import { z } from "zod";
import { AddCellMembersSchema, CellRoleSchema, CreateCellSchema, UpdateCellSchema, type CellAdminDto, type ConversationDetailDto } from "@daveup/shared";
import { withTenant, type Tx } from "../db/pool";
import { audit } from "../lib/audit";
import { assertRoom } from "../lib/limits";
import { canManageCell, detail, loadConversation, namesList, personName, systemMessage } from "../lib/chat";
import { requireAdmin, requireMember } from "../lib/context";
import { badRequest, conflict, forbidden, notFound, parse } from "../lib/errors";
import { notify } from "../lib/notify";
import { publish } from "../lib/realtime";

const IdParam = z.object({ id: z.string().uuid() });
const MemberParam = z.object({ id: z.string().uuid(), personId: z.string().uuid() });

/** Approved members of this church among `ids`, with names. Throws if any is not. */
async function approvedMembers(tx: Tx, ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await tx
    .selectFrom("membership as ms")
    .innerJoin("person as p", "p.id", "ms.person_id")
    .select(["p.id", "p.full_name"])
    .where("ms.status", "=", "approved")
    .where("p.id", "in", unique)
    .execute();
  if (rows.length !== unique.length) throw badRequest("NOT_MEMBERS", "Everyone in a cell must be an approved member of your organization");
  return new Map(rows.map((r) => [r.id, r.full_name ?? "Member"]));
}

async function loadCell(tx: Tx, id: string, personId: string, isAdmin: boolean, lock = false) {
  const r = await loadConversation(tx, id, personId, { adminMayManage: true, isAdmin, lock });
  if (r.conv.kind !== "cell") throw notFound("Cell not found");
  return r;
}

async function requireManager(tx: Tx, id: string, personId: string, isAdmin: boolean) {
  const r = await loadCell(tx, id, personId, isAdmin, true);
  if (!canManageCell(r.member, isAdmin)) throw forbidden("Only the cell's leaders and organization administrators can do this");
  return r;
}

async function leaderCount(tx: Tx, id: string): Promise<number> {
  const r = await tx.selectFrom("conversation_member").select((e) => e.fn.countAll<string>().as("n")).where("conversation_id", "=", id).where("role", "=", "leader").executeTakeFirst();
  return Number(r?.n ?? 0);
}

/** The person who registered the organization, while they are still an approved member. */
export async function ownerIfMember(tx: Tx, churchId: string): Promise<string | null> {
  const c = await tx.selectFrom("church").select("created_by").where("id", "=", churchId).executeTakeFirst();
  if (!c) return null;
  const m = await tx.selectFrom("membership").select("id").where("person_id", "=", c.created_by).where("church_id", "=", churchId).where("status", "=", "approved").executeTakeFirst();
  return m ? c.created_by : null;
}

export async function cellRoutes(app: FastifyInstance) {
  /** Church admins: every cell in the church. */
  app.get("/cells", async (req): Promise<CellAdminDto[]> => {
    const ctx = await requireAdmin(req);
    return withTenant(ctx.membership.churchId, async (tx) => {
      const cells = await tx.selectFrom("conversation").selectAll().where("kind", "=", "cell").orderBy(sql`archived_at is not null`).orderBy("name").execute();
      if (cells.length === 0) return [];
      const members = await tx
        .selectFrom("conversation_member as cm")
        .innerJoin("person as p", "p.id", "cm.person_id")
        .select(["cm.conversation_id", "cm.person_id", "cm.role", "p.full_name"])
        .where("cm.conversation_id", "in", cells.map((c) => c.id))
        .execute();
      return cells.map((c) => {
        const mine = members.filter((m) => m.conversation_id === c.id);
        return {
          id: c.id,
          name: c.name!,
          description: c.description,
          memberCount: mine.length,
          leaders: mine.filter((m) => m.role === "leader").map((m) => ({ personId: m.person_id, fullName: m.full_name ?? "Member" })),
          createdAt: c.created_at.toISOString(),
          lastMessageAt: c.last_message_at.toISOString(),
          archived: !!c.archived_at,
          iAmMember: mine.some((m) => m.person_id === ctx.personId),
        };
      });
    });
  });

  app.post("/cells", async (req, reply): Promise<ConversationDetailDto> => {
    const ctx = await requireAdmin(req);
    const body = parse(CreateCellSchema, req.body);
    const churchId = ctx.membership.churchId;
    const out = await withTenant(churchId, async (tx) => {
      await assertRoom(tx, churchId, "cells");
      // No leader chosen: the organization's owner leads it (or the admin creating it, if the owner has left).
      if (body.leaderIds.length === 0) body.leaderIds = [(await ownerIfMember(tx, churchId)) ?? ctx.personId];
      const memberIds = body.memberIds.filter((id) => !body.leaderIds.includes(id));
      const names = await approvedMembers(tx, [...body.leaderIds, ...memberIds]);
      const cell = await tx
        .insertInto("conversation")
        .values({ church_id: churchId, kind: "cell", name: body.name, description: body.description || null, created_by: ctx.personId })
        .returning("id")
        .executeTakeFirstOrThrow();
      await tx
        .insertInto("conversation_member")
        .values([
          ...body.leaderIds.map((p) => ({ conversation_id: cell.id, church_id: churchId, person_id: p, role: "leader" as const, added_by: ctx.personId })),
          ...memberIds.map((p) => ({ conversation_id: cell.id, church_id: churchId, person_id: p, role: "member" as const, added_by: ctx.personId })),
        ])
        .execute();
      const by = await personName(tx, ctx.personId);
      await systemMessage(tx, churchId, cell.id, `${by} created ${body.name}`, { action: "cell.created" });
      await audit(tx, { churchId, actorId: ctx.personId, action: "cell.created", targetType: "cell", targetId: cell.id, data: { name: body.name, members: names.size } });
      const added = [...names.keys()].filter((p) => p !== ctx.personId);
      await notify(tx, churchId, added, "cell.added", { cellName: body.name, conversationId: cell.id, addedBy: by });
      await publish(tx, { churchId, to: added, event: { type: "conversation", conversationId: cell.id } });
      const { conv, member } = await loadCell(tx, cell.id, ctx.personId, true);
      return detail(tx, conv, member, ctx.personId, true);
    });
    reply.code(201);
    return out;
  });

  /** Rename or describe a cell (leaders and admins). */
  app.patch("/cells/:id", async (req): Promise<ConversationDetailDto> => {
    const ctx = await requireMember(req);
    const { id } = parse(IdParam, req.params);
    const body = parse(UpdateCellSchema, req.body);
    const churchId = ctx.membership.churchId;
    return withTenant(churchId, async (tx) => {
      const { conv } = await requireManager(tx, id, ctx.personId, ctx.membership.isAdmin);
      await tx
        .updateTable("conversation")
        .set({ ...(body.name !== undefined ? { name: body.name } : {}), ...(body.description !== undefined ? { description: body.description || null } : {}) })
        .where("id", "=", id)
        .execute();
      if (body.name !== undefined && body.name !== conv.name) {
        await systemMessage(tx, churchId, id, `${await personName(tx, ctx.personId)} renamed the cell to ${body.name}`, { action: "cell.renamed" });
      }
      await publish(tx, { churchId, conversationId: id, event: { type: "conversation", conversationId: id } });
      const r = await loadCell(tx, id, ctx.personId, ctx.membership.isAdmin);
      return detail(tx, r.conv, r.member, ctx.personId, ctx.membership.isAdmin);
    });
  });

  /** Archive (read-only) or reopen a cell. Church admins only. */
  for (const action of ["archive", "unarchive"] as const) {
    app.post(`/cells/:id/${action}`, async (req): Promise<ConversationDetailDto> => {
      const ctx = await requireAdmin(req);
      const { id } = parse(IdParam, req.params);
      const churchId = ctx.membership.churchId;
      return withTenant(churchId, async (tx) => {
        const { conv } = await loadCell(tx, id, ctx.personId, true, true);
        if ((action === "archive") === !!conv.archived_at) throw conflict("NO_CHANGE", action === "archive" ? "This cell is already archived" : "This cell is not archived");
        await tx.updateTable("conversation").set({ archived_at: action === "archive" ? new Date() : null }).where("id", "=", id).execute();
        await systemMessage(tx, churchId, id, action === "archive" ? "This cell was archived. Its messages and files stay readable." : "This cell was reopened.", { action: `cell.${action}d` });
        await audit(tx, { churchId, actorId: ctx.personId, action: `cell.${action}d`, targetType: "cell", targetId: id });
        await publish(tx, { churchId, conversationId: id, event: { type: "conversation", conversationId: id } });
        const r = await loadCell(tx, id, ctx.personId, true);
        return detail(tx, r.conv, r.member, ctx.personId, true);
      });
    });
  }

  app.post("/cells/:id/members", async (req): Promise<ConversationDetailDto> => {
    const ctx = await requireMember(req);
    const { id } = parse(IdParam, req.params);
    const { personIds } = parse(AddCellMembersSchema, req.body);
    const churchId = ctx.membership.churchId;
    return withTenant(churchId, async (tx) => {
      const { conv } = await requireManager(tx, id, ctx.personId, ctx.membership.isAdmin);
      if (conv.archived_at) throw forbidden("Reopen this cell before adding people");
      const names = await approvedMembers(tx, personIds);
      const existing = await tx.selectFrom("conversation_member").select("person_id").where("conversation_id", "=", id).where("person_id", "in", [...names.keys()]).execute();
      const fresh = [...names.keys()].filter((p) => !existing.some((e) => e.person_id === p));
      if (fresh.length > 0) {
        await tx
          .insertInto("conversation_member")
          .values(fresh.map((p) => ({ conversation_id: id, church_id: churchId, person_id: p, role: "member" as const, added_by: ctx.personId })))
          .execute();
        // New members start "caught up": history is there to scroll, not 200 unread messages.
        await tx
          .updateTable("conversation_member")
          .set({ last_read_seq: sql`(select coalesce(max(seq), 0) from message where conversation_id = ${id})` as unknown as string })
          .where("conversation_id", "=", id)
          .where("person_id", "in", fresh)
          .execute();
        const by = await personName(tx, ctx.personId);
        await systemMessage(tx, churchId, id, `${by} added ${namesList(fresh.map((p) => names.get(p)!))}`, { action: "cell.members_added" });
        await notify(tx, churchId, fresh.filter((p) => p !== ctx.personId), "cell.added", { cellName: conv.name!, conversationId: id, addedBy: by });
        await publish(tx, { churchId, conversationId: id, event: { type: "conversation", conversationId: id } });
        await audit(tx, { churchId, actorId: ctx.personId, action: "cell.members_added", targetType: "cell", targetId: id, data: { count: fresh.length } });
      }
      const r = await loadCell(tx, id, ctx.personId, ctx.membership.isAdmin);
      return detail(tx, r.conv, r.member, ctx.personId, ctx.membership.isAdmin);
    });
  });

  /** Make someone a leader, or a member again. */
  app.patch("/cells/:id/members/:personId", async (req): Promise<ConversationDetailDto> => {
    const ctx = await requireMember(req);
    const { id, personId } = parse(MemberParam, req.params);
    const { role } = parse(CellRoleSchema, req.body);
    const churchId = ctx.membership.churchId;
    return withTenant(churchId, async (tx) => {
      await requireManager(tx, id, ctx.personId, ctx.membership.isAdmin);
      const target = await tx.selectFrom("conversation_member").select("role").where("conversation_id", "=", id).where("person_id", "=", personId).executeTakeFirst();
      if (!target) throw notFound("That person is not in this cell");
      if (target.role === "leader" && role === "member" && (await leaderCount(tx, id)) <= 1) {
        throw conflict("LAST_LEADER", "A cell needs at least one leader. Make someone else a leader first.");
      }
      if (target.role !== role) {
        await tx.updateTable("conversation_member").set({ role }).where("conversation_id", "=", id).where("person_id", "=", personId).execute();
        const who = await personName(tx, personId);
        await systemMessage(tx, churchId, id, role === "leader" ? `${who} is now a leader of this cell` : `${who} is no longer a leader of this cell`, { action: "cell.role" });
        await publish(tx, { churchId, conversationId: id, event: { type: "conversation", conversationId: id } });
      }
      const r = await loadCell(tx, id, ctx.personId, ctx.membership.isAdmin);
      return detail(tx, r.conv, r.member, ctx.personId, ctx.membership.isAdmin);
    });
  });

  /** Remove someone (leaders and admins), or leave the cell yourself. */
  app.delete("/cells/:id/members/:personId", async (req): Promise<{ ok: true }> => {
    const ctx = await requireMember(req);
    const { id, personId } = parse(MemberParam, req.params);
    const churchId = ctx.membership.churchId;
    const self = personId === ctx.personId;
    await withTenant(churchId, async (tx) => {
      const { member } = await loadCell(tx, id, ctx.personId, ctx.membership.isAdmin, true);
      if (!self && !canManageCell(member, ctx.membership.isAdmin)) throw forbidden("Only the cell's leaders and organization administrators can remove people");
      const target = await tx.selectFrom("conversation_member").select("role").where("conversation_id", "=", id).where("person_id", "=", personId).executeTakeFirst();
      if (!target) throw notFound("That person is not in this cell");
      if (target.role === "leader" && (await leaderCount(tx, id)) <= 1) {
        throw conflict("LAST_LEADER", "A cell needs at least one leader. Make someone else a leader first.");
      }
      // Tell them before they are removed, so their app drops the cell straight away.
      await publish(tx, { churchId, to: [personId], event: { type: "conversation", conversationId: id } });
      await tx.deleteFrom("conversation_member").where("conversation_id", "=", id).where("person_id", "=", personId).execute();
      const who = await personName(tx, personId);
      await systemMessage(tx, churchId, id, self ? `${who} left the cell` : `${await personName(tx, ctx.personId)} removed ${who}`, { action: self ? "cell.left" : "cell.member_removed" });
      await publish(tx, { churchId, conversationId: id, event: { type: "conversation", conversationId: id } });
      await audit(tx, { churchId, actorId: ctx.personId, action: self ? "cell.left" : "cell.member_removed", targetType: "cell", targetId: id, data: { personId } });
    });
    return { ok: true };
  });
}
