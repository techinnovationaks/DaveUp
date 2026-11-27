// Journal: each person's private entries. Only the writer can read an entry,
// unless they share it with the discipler of one of their discipleship
// relationships. Entries belong to the person (not an organization), so the
// owner connection is used with explicit person checks.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { JOURNAL_PAGE, JournalEntrySchema, JournalShareSchema, type JournalEntryDto, type JournalListDto, type SharedJournalEntryDto } from "@daveup/shared";
import { ownerDb } from "../db/pool";
import { requireAuth } from "../lib/context";
import { badRequest, forbidden, notFound, parse } from "../lib/errors";

const IdParam = z.object({ id: z.string().uuid() });
const ListQuery = z.object({ before: z.string().datetime().optional() });

/** Relationships that can still see shared entries. */
const OPEN = ["accepted_baseline_pending", "active", "paused"] as const;

function entryQuery() {
  return ownerDb
    .selectFrom("journal_entry as j")
    .leftJoin("relationship as r", (j) => j.onRef("r.id", "=", "j.shared_relationship_id").on("r.status", "in", OPEN))
    .leftJoin("person as d", "d.id", "r.discipler_id")
    .select(["j.id", "j.title", "j.body", "j.created_at", "j.updated_at", "j.shared_at", "r.id as rel_id", "d.full_name as discipler_name"]);
}

type EntryRow = Awaited<ReturnType<ReturnType<typeof entryQuery>["executeTakeFirstOrThrow"]>>;

function toDto(e: EntryRow): JournalEntryDto {
  return {
    id: e.id,
    title: e.title,
    body: e.body,
    createdAt: e.created_at.toISOString(),
    updatedAt: e.updated_at.toISOString(),
    sharedWith: e.rel_id && e.shared_at ? { relationshipId: e.rel_id, disciplerName: e.discipler_name ?? "Your discipler", sharedAt: e.shared_at.toISOString() } : null,
  };
}

async function ownEntry(personId: string, id: string): Promise<EntryRow> {
  const e = await entryQuery().where("j.id", "=", id).where("j.person_id", "=", personId).executeTakeFirst();
  if (!e) throw notFound("Entry not found");
  return e;
}

export async function journalRoutes(app: FastifyInstance) {
  /** My entries, newest first, with the disciplers I could share with. */
  app.get("/journal", async (req): Promise<JournalListDto> => {
    const { personId } = requireAuth(req);
    const { before } = parse(ListQuery, req.query);
    let q = entryQuery().where("j.person_id", "=", personId).orderBy("j.created_at", "desc").limit(JOURNAL_PAGE + 1);
    if (before) q = q.where("j.created_at", "<", new Date(before));
    const rows = await q.execute();
    const more = rows.length > JOURNAL_PAGE;
    const page = rows.slice(0, JOURNAL_PAGE);
    const targets = await ownerDb
      .selectFrom("relationship as r")
      .innerJoin("person as d", "d.id", "r.discipler_id")
      .innerJoin("church as c", "c.id", "r.church_id")
      .select(["r.id", "d.full_name", "c.name"])
      .where("r.disciple_id", "=", personId)
      .where("r.status", "in", OPEN)
      .orderBy("r.created_at")
      .execute();
    return {
      entries: page.map(toDto),
      nextBefore: more ? page.at(-1)!.created_at.toISOString() : null,
      shareTargets: targets.map((t) => ({ relationshipId: t.id, disciplerName: t.full_name ?? "Your discipler", churchName: t.name })),
    };
  });

  app.post("/journal", async (req, reply): Promise<JournalEntryDto> => {
    const { personId } = requireAuth(req);
    const { title, body } = parse(JournalEntrySchema, req.body);
    const { id } = await ownerDb
      .insertInto("journal_entry")
      .values({ person_id: personId, title: title || null, body })
      .returning("id")
      .executeTakeFirstOrThrow();
    reply.code(201);
    return toDto(await ownEntry(personId, id));
  });

  app.put("/journal/:id", async (req): Promise<JournalEntryDto> => {
    const { personId } = requireAuth(req);
    const { id } = parse(IdParam, req.params);
    const { title, body } = parse(JournalEntrySchema, req.body);
    await ownEntry(personId, id);
    await ownerDb.updateTable("journal_entry").set({ title: title || null, body, updated_at: new Date() }).where("id", "=", id).where("person_id", "=", personId).execute();
    return toDto(await ownEntry(personId, id));
  });

  app.delete("/journal/:id", async (req) => {
    const { personId } = requireAuth(req);
    const { id } = parse(IdParam, req.params);
    await ownEntry(personId, id);
    await ownerDb.deleteFrom("journal_entry").where("id", "=", id).where("person_id", "=", personId).execute();
    return { ok: true };
  });

  /** Share one entry with my discipler in a relationship, or stop sharing it. */
  app.put("/journal/:id/share", async (req): Promise<JournalEntryDto> => {
    const { personId } = requireAuth(req);
    const { id } = parse(IdParam, req.params);
    const { relationshipId } = parse(JournalShareSchema, req.body);
    await ownEntry(personId, id);
    if (relationshipId) {
      const r = await ownerDb.selectFrom("relationship").select(["disciple_id", "status"]).where("id", "=", relationshipId).executeTakeFirst();
      if (!r || r.disciple_id !== personId) throw badRequest("NOT_YOUR_DISCIPLER", "You can share entries only with your own discipler");
      if (!(OPEN as readonly string[]).includes(r.status)) throw badRequest("RELATIONSHIP_CLOSED", "That discipleship relationship is not active");
    }
    await ownerDb
      .updateTable("journal_entry")
      .set({ shared_relationship_id: relationshipId, shared_at: relationshipId ? new Date() : null })
      .where("id", "=", id)
      .where("person_id", "=", personId)
      .execute();
    return toDto(await ownEntry(personId, id));
  });

  /** A discipler reads the entries their disciple shared in this relationship. */
  app.get("/relationships/:id/journal", async (req): Promise<SharedJournalEntryDto[]> => {
    const { personId } = requireAuth(req);
    const { id } = parse(IdParam, req.params);
    const r = await ownerDb.selectFrom("relationship").select(["discipler_id", "disciple_id", "status"]).where("id", "=", id).executeTakeFirst();
    if (!r || (r.discipler_id !== personId && r.disciple_id !== personId)) throw notFound("Relationship not found");
    if (!(OPEN as readonly string[]).includes(r.status)) return [];
    if (r.discipler_id !== personId) throw forbidden("Only the discipler sees entries shared with them");
    const rows = await ownerDb
      .selectFrom("journal_entry")
      .select(["id", "title", "body", "created_at", "shared_at"])
      .where("shared_relationship_id", "=", id)
      .where("person_id", "=", r.disciple_id)
      .orderBy("shared_at", "desc")
      .limit(100)
      .execute();
    return rows.map((e) => ({ id: e.id, title: e.title, body: e.body, createdAt: e.created_at.toISOString(), sharedAt: e.shared_at!.toISOString() }));
  });
}
