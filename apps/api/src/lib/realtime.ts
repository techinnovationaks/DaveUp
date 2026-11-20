// Live updates: chat messages, typing, read markers, calls ringing.
//
// Each browser tab keeps one WebSocket to /realtime. Routes publish events
// with Postgres NOTIFY, usually inside the transaction that made the change,
// so an event is sent only once that change is committed. Every API instance
// LISTENs and forwards each event to the people connected to it, so this
// works with any number of instances and needs no extra service.
//
// Events carry ids and names only. Clients fetch message content over HTTP,
// where access is checked.
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { WebSocket } from "ws";
import { sql, type Kysely } from "kysely";
import pg from "pg";
import type { RealtimeClientEvent, RealtimeEvent } from "@daveup/shared";
import { config } from "../config";
import { ownerDb } from "../db/pool";
import type { DB } from "../db/types";
import { requireMember } from "./context";

const CHANNEL = "daveup_events";
/** Postgres NOTIFY payloads must stay under 8000 bytes. */
const MAX_PAYLOAD = 7800;

interface Envelope {
  churchId: string;
  /** Deliver to the members of this conversation (looked up on delivery)... */
  conversationId?: string;
  /** ...or to exactly these people. */
  to?: string[];
  /** Never to this person (usually the one who acted). */
  exclude?: string;
  event: RealtimeEvent;
}

/**
 * Queue an event. Inside a transaction it goes out on commit and is dropped on
 * rollback, the same guarantee as the email outbox.
 */
export async function publish(db: Kysely<DB>, envelope: Envelope): Promise<void> {
  let payload = JSON.stringify(envelope);
  if (payload.length > MAX_PAYLOAD && envelope.conversationId) {
    // Large recipient lists: let each instance look the members up instead.
    payload = JSON.stringify({ ...envelope, to: undefined });
  }
  if (payload.length > MAX_PAYLOAD) throw new Error("Realtime event too large");
  await sql`select pg_notify(${CHANNEL}, ${payload})`.execute(db);
}

interface Client {
  socket: WebSocket;
  personId: string;
  churchId: string;
  name: string;
  alive: boolean;
  /** conversationId -> last typing event time, to throttle. */
  typingAt: Map<string, number>;
}

/** People connected to this API instance. */
class Hub {
  private byPerson = new Map<string, Set<Client>>();
  private listener: pg.Client | null = null;
  private stopped = false;
  private retry = 1000;
  private heartbeat: NodeJS.Timeout | null = null;

  add(c: Client) {
    let set = this.byPerson.get(c.personId);
    if (!set) this.byPerson.set(c.personId, (set = new Set()));
    set.add(c);
  }

  remove(c: Client) {
    const set = this.byPerson.get(c.personId);
    set?.delete(c);
    if (set?.size === 0) this.byPerson.delete(c.personId);
  }

  get size() {
    return this.byPerson.size;
  }

  private send(personId: string, churchId: string, event: RealtimeEvent) {
    const data = JSON.stringify(event);
    for (const c of this.byPerson.get(personId) ?? []) {
      // Defence in depth: never cross churches, even if a payload were wrong.
      if (c.churchId === churchId && c.socket.readyState === c.socket.OPEN) c.socket.send(data);
    }
  }

  async deliver(env: Envelope) {
    if (this.byPerson.size === 0) return;
    let recipients = env.to;
    if (!recipients && env.conversationId) {
      const rows = await ownerDb
        .selectFrom("conversation_member")
        .select("person_id")
        .where("conversation_id", "=", env.conversationId)
        .where("church_id", "=", env.churchId)
        .execute();
      recipients = rows.map((r) => r.person_id);
    }
    for (const id of recipients ?? []) {
      if (id !== env.exclude) this.send(id, env.churchId, env.event);
    }
  }

  async start() {
    this.stopped = false;
    await this.connect();
    // Drop sockets that stopped answering pings (closed laptops, lost signal).
    this.heartbeat = setInterval(() => {
      for (const set of this.byPerson.values()) {
        for (const c of set) {
          if (!c.alive) {
            c.socket.terminate();
            continue;
          }
          c.alive = false;
          c.socket.ping();
        }
      }
    }, 30_000);
    this.heartbeat.unref();
  }

  private async connect() {
    if (this.stopped) return;
    const client = new pg.Client({ connectionString: config.ownerDatabaseUrl });
    client.on("notification", (msg) => {
      if (msg.channel !== CHANNEL || !msg.payload) return;
      let env: Envelope;
      try {
        env = JSON.parse(msg.payload) as Envelope;
      } catch {
        return;
      }
      this.deliver(env).catch((err) => console.error("[realtime] delivery failed:", err instanceof Error ? err.message : err));
    });
    const reconnect = () => {
      if (this.listener !== client) return;
      this.listener = null;
      client.end().catch(() => {});
      if (this.stopped) return;
      const wait = this.retry;
      this.retry = Math.min(this.retry * 2, 30_000);
      setTimeout(() => void this.connect(), wait).unref();
    };
    client.on("error", (err) => {
      console.error("[realtime] listener error:", err.message);
      reconnect();
    });
    client.on("end", reconnect);
    try {
      await client.connect();
      await client.query(`LISTEN ${CHANNEL}`);
      this.listener = client;
      this.retry = 1000;
    } catch (err) {
      console.error("[realtime] could not listen:", err instanceof Error ? err.message : err);
      this.listener = client;
      reconnect();
    }
  }

  async stop() {
    this.stopped = true;
    if (this.heartbeat) clearInterval(this.heartbeat);
    for (const set of this.byPerson.values()) for (const c of set) c.socket.close(1001, "Server shutting down");
    this.byPerson.clear();
    const l = this.listener;
    this.listener = null;
    await l?.end().catch(() => {});
  }
}

type RtRequest = FastifyRequest & { rt?: { personId: string; churchId: string; name: string } };

/** Needs @fastify/websocket registered on the root instance first (see server.ts). */
export async function realtimeRoutes(app: FastifyInstance) {
  const hub = new Hub();
  app.addHook("onReady", () => hub.start());
  app.addHook("onClose", () => hub.stop());

  app.get(
    "/realtime",
    {
      websocket: true,
      // Checked before the upgrade: a refused connection gets a plain HTTP error.
      preValidation: async (req: RtRequest) => {
        const ctx = await requireMember(req);
        const p = await ownerDb.selectFrom("person").select("full_name").where("id", "=", ctx.personId).executeTakeFirst();
        req.rt = { personId: ctx.personId, churchId: ctx.membership.churchId, name: p?.full_name ?? "Someone" };
      },
    },
    (socket, req: RtRequest) => {
      const c: Client = { socket, personId: req.rt!.personId, churchId: req.rt!.churchId, name: req.rt!.name, alive: true, typingAt: new Map() };
      hub.add(c);
      socket.on("pong", () => (c.alive = true));
      socket.on("close", () => hub.remove(c));
      socket.on("message", (raw) => {
        c.alive = true;
        let msg: RealtimeClientEvent;
        try {
          msg = JSON.parse(String(raw)) as RealtimeClientEvent;
        } catch {
          return;
        }
        if (msg.type === "ping") return void socket.send('{"type":"pong"}');
        if (msg.type === "typing" && typeof msg.conversationId === "string") void onTyping(c, msg.conversationId);
      });
      socket.send(JSON.stringify({ type: "hello", personId: c.personId } satisfies RealtimeEvent));
    },
  );
}

/** Tell the rest of the conversation someone is typing (at most every 3 seconds). */
async function onTyping(c: Client, conversationId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(conversationId)) return;
  const last = c.typingAt.get(conversationId) ?? 0;
  if (Date.now() - last < 3000) return;
  c.typingAt.set(conversationId, Date.now());
  try {
    const member = await ownerDb
      .selectFrom("conversation_member")
      .select("person_id")
      .where("conversation_id", "=", conversationId)
      .where("person_id", "=", c.personId)
      .where("church_id", "=", c.churchId)
      .executeTakeFirst();
    if (!member) return;
    await publish(ownerDb, {
      churchId: c.churchId,
      conversationId,
      exclude: c.personId,
      event: { type: "typing", conversationId, personId: c.personId, name: c.name },
    });
  } catch (err) {
    console.error("[realtime] typing failed:", err instanceof Error ? err.message : err);
  }
}
