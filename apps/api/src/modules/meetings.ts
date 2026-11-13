// Discipleship meetings and the one-minute meeting record (PRD 8.4, 38.3).
// Seen only by the two people in the relationship.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { MeetingCreateSchema, MeetingRecordSchema, RECORD_EDIT_HOURS, type MeetingDto, type MeetingsDto } from "@daveup/shared";
import { withTenant, type Tx } from "../db/pool";
import { audit } from "../lib/audit";
import { requireMember } from "../lib/context";
import { badRequest, conflict, notFound, parse } from "../lib/errors";
import { requireOpen, requireParty } from "./party";

const IdParam = z.object({ id: z.string().uuid() });
const HOUR = 3_600_000;
/** A meeting can be logged up to a week after it happened, and scheduled up to a year ahead. */
const MAX_PAST_DAYS = 7;
const MAX_AHEAD_DAYS = 365;

type MeetingRow = Awaited<ReturnType<typeof listRows>>[number];

function listRows(tx: Tx, relationshipId: string) {
  return tx
    .selectFrom("meeting as m")
    .leftJoin("person as rb", "rb.id", "m.recorded_by")
    .selectAll("m")
    .select("rb.full_name as recorder_name")
    .where("m.relationship_id", "=", relationshipId)
    .orderBy("m.scheduled_at", "desc")
    .execute();
}

function toDto(m: MeetingRow): MeetingDto {
  return {
    id: m.id,
    relationshipId: m.relationship_id,
    scheduledAt: m.scheduled_at.toISOString(),
    place: m.place,
    agenda: m.agenda,
    status: m.status,
    record:
      m.recorded_at && m.took_place !== null
        ? {
            tookPlace: m.took_place,
            discussed: m.discussed,
            commitment: m.commitment,
            prayer: m.prayer,
            win: m.win,
            recordedBy: m.recorder_name ?? "Member",
            recordedAt: m.recorded_at.toISOString(),
            editable: Date.now() - m.recorded_at.getTime() < RECORD_EDIT_HOURS * HOUR,
          }
        : null,
  };
}

async function meetingsOf(tx: Tx, relationshipId: string): Promise<MeetingsDto> {
  const rows = await listRows(tx, relationshipId);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const upcoming = rows.filter((m) => m.status === "scheduled" && m.scheduled_at >= startOfToday).reverse();
  const past = rows.filter((m) => !upcoming.includes(m));
  const lastCommitment = rows.find((m) => m.status === "held" && m.commitment)?.commitment ?? null;
  return { relationshipId, upcoming: upcoming.map(toDto), past: past.map(toDto), lastCommitment };
}

function checkWhen(iso: string) {
  const t = new Date(iso).getTime();
  if (t < Date.now() - MAX_PAST_DAYS * 24 * HOUR) throw badRequest("TOO_FAR_BACK", `Meetings can be logged up to ${MAX_PAST_DAYS} days back`);
  if (t > Date.now() + MAX_AHEAD_DAYS * 24 * HOUR) throw badRequest("TOO_FAR_AHEAD", "Choose a date within the next year");
}

async function loadMeeting(tx: Tx, id: string, personId: string) {
  const m = await tx.selectFrom("meeting").selectAll().where("id", "=", id).forUpdate().executeTakeFirst();
  if (!m) throw notFound();
  const r = await requireParty(tx, m.relationship_id, personId);
  return { m, r };
}

export async function meetingRoutes(app: FastifyInstance) {
  app.get("/relationships/:id/meetings", async (req): Promise<MeetingsDto> => {
    const ctx = await requireMember(req);
    const { id } = parse(IdParam, req.params);
    return withTenant(ctx.membership.churchId, async (tx) => {
      await requireParty(tx, id, ctx.personId);
      return meetingsOf(tx, id);
    });
  });

  /** Either person schedules a meeting, from acceptance onwards (the first review meeting). */
  app.post("/relationships/:id/meetings", async (req, reply): Promise<MeetingsDto> => {
    const ctx = await requireMember(req);
    const { id } = parse(IdParam, req.params);
    const body = parse(MeetingCreateSchema, req.body);
    const churchId = ctx.membership.churchId;
    checkWhen(body.scheduledAt);
    const out = await withTenant(churchId, async (tx) => {
      const r = await requireParty(tx, id, ctx.personId);
      requireOpen(r);
      await tx
        .insertInto("meeting")
        .values({ church_id: churchId, relationship_id: r.id, scheduled_at: new Date(body.scheduledAt), place: body.place || null, agenda: body.agenda || null, created_by: ctx.personId })
        .execute();
      await audit(tx, { churchId, actorId: ctx.personId, action: "meeting.scheduled", targetType: "relationship", targetId: r.id });
      return meetingsOf(tx, r.id);
    });
    reply.code(201);
    return out;
  });

  /** Save the meeting record. Either person may record it; it can be edited for 24 hours. */
  app.post("/meetings/:id/record", async (req): Promise<MeetingsDto> => {
    const ctx = await requireMember(req);
    const { id } = parse(IdParam, req.params);
    const body = parse(MeetingRecordSchema, req.body);
    const churchId = ctx.membership.churchId;
    if (body.nextMeetingAt) checkWhen(body.nextMeetingAt);
    return withTenant(churchId, async (tx) => {
      const { m, r } = await loadMeeting(tx, id, ctx.personId);
      requireOpen(r);
      if (m.status === "cancelled") throw conflict("CANCELLED", "This meeting was cancelled");
      if (m.recorded_at && Date.now() - m.recorded_at.getTime() >= RECORD_EDIT_HOURS * HOUR) {
        throw conflict("RECORD_LOCKED", `A meeting record can only be edited for ${RECORD_EDIT_HOURS} hours`);
      }
      if (m.scheduled_at.getTime() > Date.now() + HOUR) throw badRequest("NOT_YET", "You can record a meeting once it has started");
      await tx
        .updateTable("meeting")
        .set({
          status: body.tookPlace ? "held" : "missed",
          took_place: body.tookPlace,
          discussed: body.discussed || null,
          commitment: body.commitment || null,
          prayer: body.prayer || null,
          win: body.win || null,
          recorded_by: ctx.personId,
          recorded_at: m.recorded_at ?? new Date(),
        })
        .where("id", "=", m.id)
        .execute();
      if (body.nextMeetingAt) {
        const already = await tx.selectFrom("meeting").select("id").where("relationship_id", "=", r.id).where("status", "=", "scheduled").where("scheduled_at", "=", new Date(body.nextMeetingAt)).executeTakeFirst();
        if (!already) {
          await tx.insertInto("meeting").values({ church_id: churchId, relationship_id: r.id, scheduled_at: new Date(body.nextMeetingAt), created_by: ctx.personId }).execute();
        }
      }
      await audit(tx, { churchId, actorId: ctx.personId, action: body.tookPlace ? "meeting.held" : "meeting.missed", targetType: "relationship", targetId: r.id });
      return meetingsOf(tx, r.id);
    });
  });

  app.post("/meetings/:id/cancel", async (req): Promise<MeetingsDto> => {
    const ctx = await requireMember(req);
    const { id } = parse(IdParam, req.params);
    const churchId = ctx.membership.churchId;
    return withTenant(churchId, async (tx) => {
      const { m, r } = await loadMeeting(tx, id, ctx.personId);
      if (m.status !== "scheduled") throw conflict("NOT_SCHEDULED", "Only a scheduled meeting can be cancelled");
      await tx.updateTable("meeting").set({ status: "cancelled" }).where("id", "=", m.id).execute();
      await audit(tx, { churchId, actorId: ctx.personId, action: "meeting.cancelled", targetType: "relationship", targetId: r.id });
      return meetingsOf(tx, r.id);
    });
  });
}
