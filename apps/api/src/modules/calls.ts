// Audio and video calls in a direct chat or a cell, hosted by LiveKit.
//
// Starting a call posts a call message in the conversation and rings the other
// members. Anyone in the conversation can join while it is live. A call ends
// when everyone has left (checked against LiveKit, so closed tabs count as
// gone), or when a direct call is declined or not answered in time.
import type { FastifyInstance } from "fastify";
import { sql } from "kysely";
import { z } from "zod";
import { CALL_MAX_PARTICIPANTS, CALL_RING_SECONDS, CallMuteSchema, StartCallSchema, type ActiveCallDto, type CallJoinDto } from "@daveup/shared";
import { config } from "../config";
import { ownerDb, withTenant, type Tx } from "../db/pool";
import { activeCalls, isCallLeader, personName, postMessage, requireConversationMember, requireNotBlocked, requireWritable } from "../lib/chat";
import { requireMember } from "../lib/context";
import { AppError, conflict, forbidden, notFound, parse } from "../lib/errors";
import { closeRoom, joinToken, livekitEnabled, muteMicrophone, roomParticipants } from "../lib/livekit";
import { publish } from "../lib/realtime";
import { getStorage } from "../lib/storage";

const IdParam = z.object({ id: z.string().uuid() });

function requireCalls() {
  if (!livekitEnabled()) throw new AppError(503, "CALLS_UNAVAILABLE", "Calls are not set up on this server yet");
}

type CallRow = { id: string; church_id: string; conversation_id: string; room_name: string; started_by: string; answered_at: Date | null; ended_at: Date | null; media: "audio" | "video" };

/** Add (or re-add) a person to a live call and sign their LiveKit token. */
async function joinCall(tx: Tx, call: CallRow, personId: string, role: { leader: boolean; group: boolean }): Promise<CallJoinDto> {
  const live = await tx.selectFrom("call_participant").select((e) => e.fn.countAll<string>().as("n")).where("call_id", "=", call.id).where("left_at", "is", null).where("person_id", "!=", personId).executeTakeFirst();
  if (Number(live?.n ?? 0) >= CALL_MAX_PARTICIPANTS) throw conflict("CALL_FULL", `This call is full (${CALL_MAX_PARTICIPANTS} people)`);
  await tx
    .insertInto("call_participant")
    .values({ call_id: call.id, church_id: call.church_id, person_id: personId })
    .onConflict((oc) => oc.columns(["call_id", "person_id"]).doUpdateSet({ joined_at: new Date(), left_at: null }))
    .execute();
  if (personId !== call.started_by && !call.answered_at) {
    await tx.updateTable("call_session").set({ answered_at: new Date() }).where("id", "=", call.id).execute();
    await publish(tx, { churchId: call.church_id, conversationId: call.conversation_id, event: { type: "call.update", callId: call.id, conversationId: call.conversation_id } });
    await publishMessageChanged(tx, call);
  } else {
    await publish(tx, { churchId: call.church_id, conversationId: call.conversation_id, event: { type: "call.update", callId: call.id, conversationId: call.conversation_id } });
  }
  const name = await personName(tx, personId);
  const dto = (await activeCalls(tx, [call.conversation_id])).get(call.conversation_id)!;
  const moderator = role.group && role.leader;
  return {
    call: { ...dto, conversationId: call.conversation_id },
    canModerate: moderator,
    url: config.livekit.url,
    token: joinToken(call.room_name, personId, name, { leader: moderator }),
  };
}

async function publishMessageChanged(db: Tx, call: CallRow) {
  const m = await db.selectFrom("message").select("id").where("call_id", "=", call.id).executeTakeFirst();
  if (m) await publish(db, { churchId: call.church_id, conversationId: call.conversation_id, event: { type: "message.changed", conversationId: call.conversation_id, messageId: m.id } });
}

/** End a call (idempotent). Runs on the owner connection so the background sweeper can use it too. */
export async function endCall(callId: string): Promise<boolean> {
  const call = await ownerDb.transaction().execute(async (tx) => {
    const c = await tx.selectFrom("call_session").selectAll().where("id", "=", callId).forUpdate().executeTakeFirst();
    if (!c || c.ended_at) return null;
    const now = new Date();
    await tx.updateTable("call_session").set({ ended_at: now }).where("id", "=", callId).execute();
    await tx.updateTable("call_participant").set({ left_at: now }).where("call_id", "=", callId).where("left_at", "is", null).execute();
    await publish(tx, { churchId: c.church_id, conversationId: c.conversation_id, event: { type: "call.ended", callId, conversationId: c.conversation_id } });
    await publishMessageChanged(tx, c);
    return c;
  });
  if (!call) return false;
  await closeRoom(call.room_name).catch((err) => console.warn("[calls] could not close room:", err instanceof Error ? err.message : err));
  return true;
}

/** End the call if nobody is left in it (asking LiveKit, which knows about closed tabs). */
async function endIfEmpty(call: { id: string; room_name: string }, ignore?: string): Promise<boolean> {
  let inRoom: string[];
  try {
    inRoom = await roomParticipants(call.room_name);
  } catch (err) {
    console.warn("[calls] could not list participants:", err instanceof Error ? err.message : err);
    return false;
  }
  if (inRoom.filter((id) => id !== ignore).length > 0) return false;
  return endCall(call.id);
}

export async function callRoutes(app: FastifyInstance) {
  /** Start a call in a conversation, or join the one already running there. */
  app.post("/conversations/:id/calls", async (req, reply): Promise<CallJoinDto> => {
    const ctx = await requireMember(req);
    requireCalls();
    const { id } = parse(IdParam, req.params);
    const { media } = parse(StartCallSchema, req.body);
    const churchId = ctx.membership.churchId;
    const out = await withTenant(churchId, async (tx) => {
      const { conv, member } = await requireConversationMember(tx, id, ctx.personId);
      const role = { leader: await isCallLeader(tx, conv, member, ctx.personId, ctx.membership.isAdmin), group: conv.kind === "cell" };
      // Lock the conversation so two people pressing "call" together share one call.
      await tx.selectFrom("conversation").select("id").where("id", "=", id).forUpdate().execute();
      const existing = await tx.selectFrom("call_session").selectAll().where("conversation_id", "=", id).where("ended_at", "is", null).executeTakeFirst();
      if (existing) return joinCall(tx, existing, ctx.personId, role);
      requireWritable(conv);
      await requireNotBlocked(tx, conv, ctx.personId);
      if (!role.leader) throw forbidden("Only the cell's leaders, disciplers and administrators can start a group call. You can join one once it starts.");
      const callId = crypto.randomUUID();
      const call = await tx
        .insertInto("call_session")
        .values({ id: callId, church_id: churchId, conversation_id: id, started_by: ctx.personId, media, room_name: `daveup-${callId}` })
        .returningAll()
        .executeTakeFirstOrThrow();
      await postMessage(tx, { churchId, conversationId: id, senderId: ctx.personId, kind: "call", callId });
      const name = await personName(tx, ctx.personId);
      await publish(tx, {
        churchId,
        conversationId: id,
        exclude: ctx.personId,
        event: { type: "call.ring", callId, conversationId: id, media, fromId: ctx.personId, fromName: name, title: conv.kind === "cell" ? conv.name! : name },
      });
      return joinCall(tx, call, ctx.personId, role);
    });
    reply.code(201);
    return out;
  });

  /** The live call in a conversation, if any. */
  app.get("/conversations/:id/call", async (req): Promise<ActiveCallDto | null> => {
    const ctx = await requireMember(req);
    const { id } = parse(IdParam, req.params);
    return withTenant(ctx.membership.churchId, async (tx) => {
      await requireConversationMember(tx, id, ctx.personId);
      return (await activeCalls(tx, [id])).get(id) ?? null;
    });
  });

  app.post("/calls/:id/join", async (req): Promise<CallJoinDto> => {
    const ctx = await requireMember(req);
    requireCalls();
    const { id } = parse(IdParam, req.params);
    return withTenant(ctx.membership.churchId, async (tx) => {
      const call = await tx.selectFrom("call_session").selectAll().where("id", "=", id).forUpdate().executeTakeFirst();
      if (!call) throw notFound("Call not found");
      const { conv, member } = await requireConversationMember(tx, call.conversation_id, ctx.personId);
      if (call.ended_at) throw conflict("CALL_ENDED", "This call has ended");
      const role = { leader: await isCallLeader(tx, conv, member, ctx.personId, ctx.membership.isAdmin), group: conv.kind === "cell" };
      return joinCall(tx, call, ctx.personId, role);
    });
  });

  /**
   * A leader mutes someone's microphone (body: personId), or everyone else's
   * (no body). Group calls only. People can unmute themselves afterwards.
   */
  app.post("/calls/:id/mute", async (req): Promise<{ muted: number }> => {
    const ctx = await requireMember(req);
    requireCalls();
    const { id } = parse(IdParam, req.params);
    const target = req.body && typeof req.body === "object" && "personId" in req.body ? parse(CallMuteSchema, req.body).personId : null;
    const call = await withTenant(ctx.membership.churchId, async (tx) => {
      const c = await tx.selectFrom("call_session").selectAll().where("id", "=", id).executeTakeFirst();
      if (!c) throw notFound("Call not found");
      const { conv, member } = await requireConversationMember(tx, c.conversation_id, ctx.personId);
      if (c.ended_at) throw conflict("CALL_ENDED", "This call has ended");
      if (conv.kind !== "cell" || !(await isCallLeader(tx, conv, member, ctx.personId, ctx.membership.isAdmin))) {
        throw forbidden("Only the call's leaders can mute other people");
      }
      return c;
    });
    const everyone = target ? [target] : (await roomParticipants(call.room_name)).filter((p) => p !== ctx.personId);
    let muted = 0;
    for (const who of everyone) if (await muteMicrophone(call.room_name, who)) muted++;
    return { muted };
  });

  /** Leave a call. The call ends when nobody is left. */
  app.post("/calls/:id/leave", async (req): Promise<{ ended: boolean }> => {
    const ctx = await requireMember(req);
    const { id } = parse(IdParam, req.params);
    const call = await withTenant(ctx.membership.churchId, async (tx) => {
      const c = await tx.selectFrom("call_session").selectAll().where("id", "=", id).executeTakeFirst();
      if (!c) throw notFound("Call not found");
      await requireConversationMember(tx, c.conversation_id, ctx.personId);
      if (c.ended_at) return null;
      await tx.updateTable("call_participant").set({ left_at: new Date() }).where("call_id", "=", id).where("person_id", "=", ctx.personId).where("left_at", "is", null).execute();
      await publish(tx, { churchId: c.church_id, conversationId: c.conversation_id, event: { type: "call.update", callId: id, conversationId: c.conversation_id } });
      const left = await tx.selectFrom("call_participant").select((e) => e.fn.countAll<string>().as("n")).where("call_id", "=", id).where("left_at", "is", null).executeTakeFirst();
      return { ...c, remaining: Number(left?.n ?? 0) };
    });
    if (!call) return { ended: true };
    const conv = await ownerDb.selectFrom("conversation").select("kind").where("id", "=", call.conversation_id).executeTakeFirstOrThrow();
    // A one-to-one call ends when either person hangs up.
    if (conv.kind === "direct" || call.remaining === 0) return { ended: await endCall(call.id) };
    return { ended: await endIfEmpty(call, ctx.personId) };
  });

  /** Decline a ringing call. A declined one-to-one call ends; a cell call carries on. */
  app.post("/calls/:id/decline", async (req): Promise<{ ended: boolean }> => {
    const ctx = await requireMember(req);
    const { id } = parse(IdParam, req.params);
    const c = await withTenant(ctx.membership.churchId, async (tx) => {
      const call = await tx.selectFrom("call_session").selectAll().where("id", "=", id).executeTakeFirst();
      if (!call) throw notFound("Call not found");
      const { conv } = await requireConversationMember(tx, call.conversation_id, ctx.personId);
      return { call, kind: conv.kind };
    });
    if (c.call.ended_at) return { ended: true };
    if (c.kind === "direct" && !c.call.answered_at) return { ended: await endCall(id) };
    return { ended: false };
  });
}

/**
 * Background clean-up, every 30 seconds: stop ringing unanswered one-to-one
 * calls, and end calls everyone has left without pressing "leave".
 */
export function startCallSweeper(intervalMs = 30_000): () => Promise<void> {
  let running: Promise<unknown> | null = null;
  const tick = () => {
    if (running) return;
    running = sweepCalls()
      .catch((err) => console.error("[calls] sweep error:", err instanceof Error ? err.message : err))
      .finally(() => (running = null));
  };
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  return async () => {
    clearInterval(timer);
    await running;
  };
}

export async function sweepCalls(): Promise<number> {
  let ended = 0;
  if (livekitEnabled()) ended = await sweepLiveCalls();
  await sweepUnfinishedUploads();
  return ended;
}

async function sweepLiveCalls(): Promise<number> {
  let ended = 0;
  const unanswered = await ownerDb
    .selectFrom("call_session as c")
    .innerJoin("conversation as v", "v.id", "c.conversation_id")
    .select(["c.id"])
    .where("c.ended_at", "is", null)
    .where("c.answered_at", "is", null)
    .where("v.kind", "=", "direct")
    .where("c.started_at", "<", sql<Date>`now() - make_interval(secs => ${CALL_RING_SECONDS + 5})`)
    .execute();
  for (const c of unanswered) if (await endCall(c.id)) ended++;

  const live = await ownerDb
    .selectFrom("call_session")
    .select(["id", "room_name"])
    .where("ended_at", "is", null)
    .where("started_at", "<", sql<Date>`now() - interval '60 seconds'`)
    .execute();
  for (const c of live) if (await endIfEmpty(c)) ended++;
  return ended;
}

async function sweepUnfinishedUploads() {
  // Uploads that were started but never confirmed: remove any bytes, then the row.
  const stale = await ownerDb.selectFrom("shared_file").select(["id", "storage_key"]).where("status", "=", "pending").where("created_at", "<", sql<Date>`now() - interval '1 day'`).limit(100).execute();
  const storage = getStorage();
  for (const f of stale) {
    try {
      await storage?.remove(f.storage_key);
      await ownerDb.deleteFrom("shared_file").where("id", "=", f.id).where("status", "=", "pending").execute();
    } catch (err) {
      console.warn("[files] could not clean up an unfinished upload:", err instanceof Error ? err.message : err);
    }
  }
}
