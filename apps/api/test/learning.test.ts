// Training and the Resource Centre, end to end through the HTTP API against
// the daveup_test database, with files stored in a temporary folder.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { migrate } from "../src/db/migrate";
import { buildServer } from "../src/server";
import { closeDbs, ownerDb } from "../src/db/pool";
import { setEmailSender } from "../src/lib/email";
import { LocalStorage, setStorage } from "../src/lib/storage";
import { hmac, newSessionToken } from "../src/lib/crypto";

let app: FastifyInstance;
let dir: string;
type P = { id: string; token: string };
let seq = 0;

async function person(name: string, opts: { staff?: boolean } = {}): Promise<P> {
  const { id } = await ownerDb
    .insertInto("person")
    .values({ full_name: name, email: `p${++seq}@learning.test`, email_verified_at: new Date(), is_super_admin: !!opts.staff })
    .returning("id")
    .executeTakeFirstOrThrow();
  const token = newSessionToken();
  await ownerDb.insertInto("session").values({ person_id: id, token_hash: hmac(token), expires_at: new Date(Date.now() + 86_400_000) }).execute();
  return { id, token };
}

async function org(name: string, admin: P, members: P[]) {
  const c = await ownerDb.insertInto("church").values({ name, city: "Uyo", join_code: `L${++seq}XYZ`, created_by: admin.id }).returning("id").executeTakeFirstOrThrow();
  await ownerDb.insertInto("membership").values({ church_id: c.id, person_id: admin.id, status: "approved", participation: "both", is_admin: true }).execute();
  for (const m of members) await ownerDb.insertInto("membership").values({ church_id: c.id, person_id: m.id, status: "approved", participation: "grow" }).execute();
  return c.id;
}

const req = (p: P | null, method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: unknown, headers: Record<string, string> = {}) =>
  app.inject({ method, url, payload: payload as any, headers: { ...(p ? { authorization: `Bearer ${p.token}` } : {}), ...headers } }).then((r) => {
    let body: any = null;
    try {
      body = r.body ? r.json() : null;
    } catch {
      body = r.body;
    }
    return { status: r.statusCode, body, headers: r.headers };
  });

let staff: P, admin: P, member: P, outsider: P, otherAdmin: P;

beforeAll(async () => {
  await migrate({ reset: true });
  setEmailSender({ send: async () => {} });
  dir = await mkdtemp(join(tmpdir(), "daveup-library-"));
  setStorage(new LocalStorage(dir));
  app = await buildServer();
  await app.ready();
  staff = await person("Sam Staff", { staff: true });
  admin = await person("Ann Admin");
  member = await person("Mo Member");
  outsider = await person("Out Sider");
  otherAdmin = await person("Oli Other");
  await org("Grace Chapel", admin, [member]);
  await org("Hope House", otherAdmin, []);
});

afterAll(async () => {
  setStorage(null);
  await app.close();
  await closeDbs();
  await rm(dir, { recursive: true, force: true });
});

describe("resource centre", () => {
  let daveupLink: string;
  let orgFile: string;

  it("is for members and DaveUp staff only", async () => {
    expect((await req(outsider, "GET", "/resources")).status).toBe(403);
    expect((await req(member, "GET", "/resources")).body.rights).toEqual({ daveup: false, org: false, orgName: "Grace Chapel" });
    expect((await req(admin, "GET", "/resources")).body.rights).toMatchObject({ daveup: false, org: true });
    expect((await req(staff, "GET", "/resources")).body.rights).toMatchObject({ daveup: true, org: false });
  });

  it("lets staff add for everyone and admins for their organization only", async () => {
    const link = { title: "How to pray", category: "Prayer", kind: "video", url: "https://www.youtube.com/watch?v=abc123" };
    expect((await req(member, "POST", "/resources", { ...link, scope: "org" })).status).toBe(403);
    expect((await req(admin, "POST", "/resources", { ...link, scope: "daveup" })).status).toBe(403);
    const d = await req(staff, "POST", "/resources", { ...link, scope: "daveup" });
    expect(d.status).toBe(201);
    expect(d.body).toMatchObject({ scope: "daveup", kind: "video", canEdit: true });
    daveupLink = d.body.id;
    expect((await req(admin, "POST", "/resources", { title: "No address", kind: "link", scope: "org" })).status).toBe(400);
    expect((await req(admin, "POST", "/resources", { title: "Bad", kind: "link", url: "javascript:alert(1)", scope: "org" })).status).toBe(400);
  });

  it("uploads a file for the organization and serves it to its members only", async () => {
    const bytes = Buffer.from("%PDF-1.4 study guide");
    const t = await req(admin, "POST", "/library/uploads", { name: "Guide.pdf", mime: "application/pdf", size: bytes.length, scope: "org" });
    expect(t.status).toBe(201);
    expect((await req(admin, "POST", "/resources", { title: "Study guide", kind: "file", fileId: t.body.fileId, scope: "org" })).status).toBe(400); // not uploaded yet
    expect((await req(admin, "PUT", t.body.uploadUrl.replace("/api", ""), bytes, { "content-type": "application/pdf" })).status).toBe(200);
    const done = await req(admin, "POST", `/library/${t.body.fileId}/complete`);
    expect(done.body).toMatchObject({ name: "Guide.pdf", size: bytes.length });
    const r = await req(admin, "POST", "/resources", { title: "Study guide", category: "Bible study", kind: "file", fileId: t.body.fileId, scope: "org" });
    expect(r.status).toBe(201);
    orgFile = r.body.id;

    const seen = (await req(member, "GET", "/resources")).body.resources;
    expect(seen.map((x: any) => x.title).sort()).toEqual(["How to pray", "Study guide"]);
    expect(seen.find((x: any) => x.id === orgFile)).toMatchObject({ scope: "org", canEdit: false, file: { name: "Guide.pdf" } });
    const dl = await req(member, "GET", `/library/${t.body.fileId}/download`);
    expect(dl.status).toBe(200);
    expect(dl.body).toBe("%PDF-1.4 study guide");

    // Another organization sees DaveUp's resource but not Grace Chapel's, nor its file.
    const theirs = (await req(otherAdmin, "GET", "/resources")).body.resources.map((x: any) => x.title);
    expect(theirs).toEqual(["How to pray"]);
    expect((await req(otherAdmin, "GET", `/library/${t.body.fileId}/download`)).status).toBe(404);
  });

  it("lets only the owner side edit and remove", async () => {
    expect((await req(admin, "DELETE", `/resources/${daveupLink}`)).status).toBe(403);
    expect((await req(otherAdmin, "DELETE", `/resources/${orgFile}`)).status).toBe(404);
    const e = await req(staff, "PUT", `/resources/${daveupLink}`, { title: "How to pray well", category: "Prayer", kind: "link", url: "https://example.org/pray" });
    expect(e.body).toMatchObject({ title: "How to pray well", kind: "link" });
    expect((await req(admin, "DELETE", `/resources/${orgFile}`)).status).toBe(200);
  });
});

describe("training", () => {
  let course: string;
  let lessons: string[];

  it("keeps drafts to editors, and publishes", async () => {
    const c = await req(admin, "POST", "/training", { title: "New believers", summary: "First steps", scope: "org" });
    expect(c.status).toBe(201);
    course = c.body.id;
    expect((await req(member, "GET", "/training")).body.courses).toEqual([]);
    expect((await req(member, "GET", `/training/${course}`)).status).toBe(404);
    await req(admin, "POST", `/training/${course}/lessons`, { title: "Salvation", body: "Read John 3." });
    await req(admin, "POST", `/training/${course}/lessons`, { title: "Prayer", body: "", videoUrl: "https://youtu.be/xyz" });
    const third = await req(admin, "POST", `/training/${course}/lessons`, { title: "Church", body: "Acts 2" });
    lessons = third.body.lessons.map((l: any) => l.id);
    expect(third.body.lessons.map((l: any) => l.title)).toEqual(["Salvation", "Prayer", "Church"]);
    const moved = await req(admin, "POST", `/lessons/${lessons[2]}/move`, { direction: "up" });
    expect(moved.body.lessons.map((l: any) => l.title)).toEqual(["Salvation", "Church", "Prayer"]);
    expect((await req(member, "POST", `/training/${course}/lessons`, { title: "x" })).status).toBe(403);
    await req(admin, "PUT", `/training/${course}`, { published: true });
    expect((await req(member, "GET", "/training")).body.courses).toEqual([expect.objectContaining({ title: "New believers", lessonCount: 3, completedCount: 0, canEdit: false })]);
    expect((await req(otherAdmin, "GET", "/training")).body.courses).toEqual([]);
  });

  it("tracks each person's progress", async () => {
    expect((await req(member, "PUT", `/lessons/${lessons[0]}/progress`, { done: true })).body).toEqual({ completed: true });
    await req(member, "PUT", `/lessons/${lessons[0]}/progress`, { done: true });
    const c = (await req(member, "GET", `/training/${course}`)).body;
    expect(c.completedCount).toBe(1);
    expect(c.lessons.find((l: any) => l.id === lessons[0]).completed).toBe(true);
    expect((await req(admin, "GET", `/training/${course}`)).body.completedCount).toBe(0);
    await req(member, "PUT", `/lessons/${lessons[0]}/progress`, { done: false });
    expect((await req(member, "GET", `/training/${course}`)).body.completedCount).toBe(0);
    expect((await req(otherAdmin, "PUT", `/lessons/${lessons[0]}/progress`, { done: true })).status).toBe(404);
  });

  it("shows DaveUp courses to every organization", async () => {
    const d = await req(staff, "POST", "/training", { title: "Discipleship 101", scope: "daveup", published: true });
    await req(staff, "POST", `/training/${d.body.id}/lessons`, { title: "Welcome", body: "Hello" });
    expect((await req(otherAdmin, "GET", "/training")).body.courses.map((c: any) => c.title)).toEqual(["Discipleship 101"]);
    expect((await req(admin, "DELETE", `/training/${d.body.id}`)).status).toBe(403);
    expect((await req(staff, "DELETE", `/training/${d.body.id}`)).status).toBe(200);
  });
});
