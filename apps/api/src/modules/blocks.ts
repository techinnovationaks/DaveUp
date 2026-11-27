// Blocking people. A block works both ways and across organizations: neither
// person can start a chat, send messages or files to, or call the other, and
// they drop out of each other's people lists. Cells they share are unchanged.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { BlockSchema, type BlockedPersonDto } from "@daveup/shared";
import { ownerDb } from "../db/pool";
import { requireAuth } from "../lib/context";
import { badRequest, notFound, parse } from "../lib/errors";

export async function blockRoutes(app: FastifyInstance) {
  app.get("/blocks", async (req): Promise<BlockedPersonDto[]> => {
    const { personId } = requireAuth(req);
    const rows = await ownerDb
      .selectFrom("person_block as b")
      .innerJoin("person as p", "p.id", "b.blocked_id")
      .select(["p.id", "p.full_name", "b.created_at"])
      .where("b.blocker_id", "=", personId)
      .orderBy("b.created_at", "desc")
      .execute();
    return rows.map((r) => ({ personId: r.id, fullName: r.full_name ?? "Member", blockedAt: r.created_at.toISOString() }));
  });

  app.post("/blocks", async (req) => {
    const { personId } = requireAuth(req);
    const { personId: other } = parse(BlockSchema, req.body);
    if (other === personId) throw badRequest("SELF", "You cannot block yourself");
    const exists = await ownerDb.selectFrom("person").select("id").where("id", "=", other).executeTakeFirst();
    if (!exists) throw notFound("Person not found");
    await ownerDb.insertInto("person_block").values({ blocker_id: personId, blocked_id: other }).onConflict((oc) => oc.doNothing()).execute();
    return { blocked: true };
  });

  app.delete("/blocks/:personId", async (req) => {
    const { personId } = requireAuth(req);
    const { personId: other } = parse(z.object({ personId: z.string().uuid() }), req.params);
    await ownerDb.deleteFrom("person_block").where("blocker_id", "=", personId).where("blocked_id", "=", other).execute();
    return { blocked: false };
  });
}
