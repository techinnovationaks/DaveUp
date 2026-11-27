// Journal: private entries and sharing one with a discipler, end to end
// through the HTTP API against the daveup_test database.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { migrate } from "../src/db/migrate";
import { buildServer } from "../src/server";
import { closeDbs, ownerDb } from "../src/db/pool";
import { setEmailSender } from "../src/lib/email";
import { newSessionToken, hmac } from "../src/lib/crypto";

let app: FastifyInstance;
type P = { id: string; token: string };

async function person(name: string): Promise<P> {
  const { id } = await ownerDb.insertInto("person").values({ full_name: name, email: `${name.split(" ")[0]!.toLowerCase()}@journal.test`, email_verified_at: new Date() }).returning("id").executeTakeFirstOrThrow();
  const token = newSessionToken();
  await ownerDb.insertInto("session").values({ person_id: id, token_hash: hmac(token), expires_at: new Date(Date.now() + 86_400_000) }).execute();
  return { id, token };
}

const req = (p: P | null, method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: unknown) =>
  app.inject({ method, url, payload: payload as any, headers: p ? { authorization: `Bearer ${p.token}` } : {} }).then((r) => ({ status: r.statusCode, body: r.body ? r.json() : null }));

let ada: P, ben: P, cy: P;
let rel: string;

beforeAll(async () => {
  await migrate({ reset: true });
  setEmailSender({ send: async () => {} });
  app = await buildServer();
  await app.ready();
  ada = await person("Ada Obi");
  ben = await person("Ben Eze");
  cy = await person("Cy Udo");
  const church = await ownerDb.insertInto("church").values({ name: "Grace Chapel", city: "Uyo", join_code: "JRNL0001", created_by: ben.id }).returning("id").executeTakeFirstOrThrow();
  // Ben disciples Ada.
  rel = (await ownerDb.insertInto("relationship").values({ church_id: church.id, discipler_id: ben.id, disciple_id: ada.id, status: "active", initiated_by: "disciple" }).returning("id").executeTakeFirstOrThrow()).id;
});

afterAll(async () => {
  await app.close();
  await closeDbs();
});

describe("journal", () => {
  let entry: string;

  it("needs a signed-in person", async () => {
    expect((await req(null, "GET", "/journal")).status).toBe(401);
  });

  it("writes, edits and lists my own entries, newest first", async () => {
    const a = await req(ada, "POST", "/journal", { title: "Monday", body: "Read Psalm 23." });
    expect(a.status).toBe(201);
    expect(a.body).toMatchObject({ title: "Monday", body: "Read Psalm 23.", sharedWith: null });
    entry = a.body.id;
    await req(ada, "POST", "/journal", { body: "Second thought" });
    const edited = await req(ada, "PUT", `/journal/${entry}`, { title: "Monday morning", body: "Read Psalm 23 twice." });
    expect(edited.body.title).toBe("Monday morning");
    const list = await req(ada, "GET", "/journal");
    expect(list.body.entries.map((e: any) => e.body)).toEqual(["Second thought", "Read Psalm 23 twice."]);
    expect(list.body.shareTargets).toEqual([{ relationshipId: rel, disciplerName: "Ben Eze", churchName: "Grace Chapel" }]);
    expect((await req(ada, "POST", "/journal", { body: "   " })).status).toBe(400);
  });

  it("keeps entries private", async () => {
    expect((await req(ben, "GET", "/journal")).body.entries).toEqual([]);
    expect((await req(ben, "PUT", `/journal/${entry}`, { body: "hijack" })).status).toBe(404);
    expect((await req(ben, "DELETE", `/journal/${entry}`)).status).toBe(404);
    expect((await req(ben, "GET", `/relationships/${rel}/journal`)).body).toEqual([]);
  });

  it("shares one entry with my discipler only, and can stop sharing", async () => {
    // Cy is not part of the relationship; Ben cannot share Ada's entry.
    expect((await req(cy, "PUT", `/journal/${entry}/share`, { relationshipId: rel })).status).toBe(404);
    const shared = await req(ada, "PUT", `/journal/${entry}/share`, { relationshipId: rel });
    expect(shared.body.sharedWith).toMatchObject({ relationshipId: rel, disciplerName: "Ben Eze" });
    const seen = await req(ben, "GET", `/relationships/${rel}/journal`);
    expect(seen.body.map((e: any) => e.title)).toEqual(["Monday morning"]);
    expect((await req(cy, "GET", `/relationships/${rel}/journal`)).status).toBe(404);
    expect((await req(ada, "GET", `/relationships/${rel}/journal`)).status).toBe(403);

    await req(ada, "PUT", `/journal/${entry}/share`, { relationshipId: null });
    expect((await req(ben, "GET", `/relationships/${rel}/journal`)).body).toEqual([]);
  });

  it("refuses sharing into someone else's relationship", async () => {
    const other = await req(cy, "POST", "/journal", { body: "Mine" });
    expect((await req(cy, "PUT", `/journal/${other.body.id}/share`, { relationshipId: rel })).status).toBe(400);
  });

  it("hides shared entries once the relationship ends", async () => {
    await req(ada, "PUT", `/journal/${entry}/share`, { relationshipId: rel });
    await ownerDb.updateTable("relationship").set({ status: "ended" }).where("id", "=", rel).execute();
    expect((await req(ben, "GET", `/relationships/${rel}/journal`)).body).toEqual([]);
    expect((await req(ada, "GET", "/journal")).body.entries.find((e: any) => e.id === entry).sharedWith).toBeNull();
  });

  it("deletes my entry", async () => {
    expect((await req(ada, "DELETE", `/journal/${entry}`)).status).toBe(200);
    expect((await req(ada, "GET", "/journal")).body.entries).toHaveLength(1);
  });
});
