// One account in several organizations, switching between them, finding an
// organization by search, and blocking people. End to end through the HTTP
// API against the daveup_test database.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { migrate } from "../src/db/migrate";
import { buildServer } from "../src/server";
import { closeDbs, ownerDb } from "../src/db/pool";
import { setEmailSender } from "../src/lib/email";
import { hmac, newSessionToken } from "../src/lib/crypto";

let app: FastifyInstance;
type P = { id: string; token: string };
let seq = 0;

async function person(name: string): Promise<P> {
  const { id } = await ownerDb.insertInto("person").values({ full_name: name, email: `o${++seq}@orgs.test`, email_verified_at: new Date() }).returning("id").executeTakeFirstOrThrow();
  const token = newSessionToken();
  await ownerDb.insertInto("session").values({ person_id: id, token_hash: hmac(token), expires_at: new Date(Date.now() + 86_400_000) }).execute();
  return { id, token };
}

const req = (p: P | null, method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: unknown) =>
  app.inject({ method, url, payload: payload as any, headers: p ? { authorization: `Bearer ${p.token}` } : {} }).then((r) => ({ status: r.statusCode, body: r.body ? r.json() : null }));

async function approveAll(admin: P) {
  for (const m of (await req(admin, "GET", "/admin/approvals")).body.members) {
    expect((await req(admin, "POST", `/admin/members/${m.membershipId}/approve`, {})).status).toBe(200);
  }
}

let ada: P, ben: P, cy: P, grace: { id: string; code: string }, hope: { id: string; code: string };

beforeAll(async () => {
  await migrate({ reset: true });
  setEmailSender({ send: async () => {} });
  app = await buildServer();
  await app.ready();
  ada = await person("Ada Obi");
  ben = await person("Ben Eze");
  cy = await person("Cy Udo");
  const g = await req(ada, "POST", "/churches", { name: "Grace Chapel", city: "Uyo", participation: "both" });
  grace = { id: g.body.church.id, code: g.body.church.joinCode };
  const h = await req(ben, "POST", "/churches", { name: "Hope House", city: "Lagos", participation: "both" });
  hope = { id: h.body.church.id, code: h.body.church.joinCode };
});

afterAll(async () => {
  await app.close();
  await closeDbs();
});

describe("several organizations", () => {
  it("lets one account join a second organization and switches to it", async () => {
    const j = await req(ada, "POST", "/churches/join", { code: hope.code, participation: "grow" });
    expect(j.status).toBe(201);
    expect(j.body.membership).toMatchObject({ churchName: "Hope House", status: "pending" });
    expect(j.body.memberships.map((m: any) => [m.churchName, m.status])).toEqual([
      ["Grace Chapel", "approved"],
      ["Hope House", "pending"],
    ]);
    expect((await req(ada, "POST", "/churches/join", { code: hope.code, participation: "grow" })).status).toBe(409);
    await approveAll(ben);
  });

  it("keeps each organization's spaces and people apart", async () => {
    await req(cy, "POST", "/churches/join", { code: grace.code, participation: "grow" });
    // Approving is done as Grace Chapel's administrator, so Ada switches there first.
    expect((await req(ada, "GET", "/admin/approvals")).status).toBe(403);
    await req(ada, "POST", "/me/organization", { churchId: grace.id });
    await approveAll(ada);
    await req(ada, "POST", "/me/organization", { churchId: hope.id });
    // Ada is looking at Hope House: Cy (Grace Chapel only) is not in its people list.
    const inHope = (await req(ada, "GET", "/people/directory")).body.map((p: any) => p.fullName);
    expect(inHope).toEqual(["Ben Eze"]);
    expect((await req(ada, "POST", "/conversations/direct", { personId: cy.id })).status).toBe(404);

    const sw = await req(ada, "POST", "/me/organization", { churchId: grace.id });
    expect(sw.body.membership.churchName).toBe("Grace Chapel");
    expect((await req(ada, "GET", "/people/directory")).body.map((p: any) => p.fullName)).toEqual(["Cy Udo"]);
    const dm = await req(ada, "POST", "/conversations/direct", { personId: cy.id });
    expect(dm.status).toBe(200);
    await req(ada, "POST", `/conversations/${dm.body.id}/messages`, { body: "Hello from Grace" });

    // Back in Hope House, the Grace Chapel chat is not there.
    await req(ada, "POST", "/me/organization", { churchId: hope.id });
    expect((await req(ada, "GET", "/conversations")).body.map((c: any) => c.id)).not.toContain(dm.body.id);
    expect((await req(ada, "GET", `/conversations/${dm.body.id}`)).status).toBe(404);
  });

  it("refuses switching to an organization you do not belong to", async () => {
    expect((await req(cy, "POST", "/me/organization", { churchId: hope.id })).status).toBe(404);
  });

  it("remembers the choice per sign-in", async () => {
    expect((await req(ada, "GET", "/me")).body.membership.churchName).toBe("Hope House");
  });
});

describe("organization search", () => {
  it("finds listed organizations by name or city and lets people ask to join", async () => {
    const r = await req(cy, "GET", "/organizations/search?q=lagos");
    expect(r.body).toEqual([expect.objectContaining({ id: hope.id, name: "Hope House", verified: false, members: 2, mine: false })]);
    expect((await req(cy, "GET", "/organizations/search?q=grace")).body[0].mine).toBe(true);
    const j = await req(cy, "POST", `/organizations/${hope.id}/join`, { participation: "grow" });
    expect(j.status).toBe(201);
    expect(j.body.membership).toMatchObject({ churchName: "Hope House", status: "pending" });
  });

  it("hides organizations whose administrators turn listing off", async () => {
    expect((await req(cy, "PUT", "/church/listing", { listed: false })).status).toBe(403);
    await req(ben, "PUT", "/church/listing", { listed: false });
    expect((await req(cy, "GET", "/organizations/search?q=hope")).body).toEqual([]);
    const outsider = await person("Dee Out");
    expect((await req(outsider, "POST", `/organizations/${hope.id}/join`, { participation: "grow" })).status).toBe(404);
  });
});

describe("blocking", () => {
  let dm: string;
  it("stops messages and calls both ways, and hides each from the other", async () => {
    await req(cy, "POST", "/me/organization", { churchId: grace.id });
    await req(ada, "POST", "/me/organization", { churchId: grace.id });
    dm = (await req(cy, "POST", "/conversations/direct", { personId: ada.id })).body.id;
    expect((await req(cy, "POST", "/blocks", { personId: ada.id })).body).toEqual({ blocked: true });
    expect((await req(cy, "GET", "/blocks")).body).toEqual([expect.objectContaining({ personId: ada.id, fullName: "Ada Obi" })]);

    const mine = (await req(cy, "GET", `/conversations/${dm}`)).body;
    expect(mine).toMatchObject({ readOnly: true, blockedByMe: true, blocked: true, canStartCall: false });
    const theirs = (await req(ada, "GET", `/conversations/${dm}`)).body;
    expect(theirs).toMatchObject({ readOnly: true, blockedByMe: false, blocked: true });

    expect((await req(ada, "POST", `/conversations/${dm}/messages`, { body: "hi?" })).status).toBe(403);
    expect((await req(cy, "POST", `/conversations/${dm}/messages`, { body: "hi" })).status).toBe(403);
    expect((await req(ada, "POST", "/conversations/direct", { personId: cy.id })).status).toBe(403);
    expect((await req(ada, "GET", "/people/directory")).body.map((p: any) => p.fullName)).not.toContain("Cy Udo");
    expect((await req(cy, "GET", "/people/directory")).body.map((p: any) => p.fullName)).not.toContain("Ada Obi");
  });

  it("unblocks", async () => {
    await req(cy, "DELETE", `/blocks/${ada.id}`);
    expect((await req(ada, "POST", `/conversations/${dm}/messages`, { body: "hello again" })).status).toBe(201);
    expect((await req(cy, "POST", "/blocks", { personId: cy.id })).status).toBe(400);
  });
});
