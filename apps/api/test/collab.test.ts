// Chat, cells, files, calls, realtime and the staff console, end to end
// through the HTTP API against the daveup_test database (reset before the
// run). Fixtures here exist only in the test database.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { config } from "../src/config";
import { migrate } from "../src/db/migrate";
import { buildServer } from "../src/server";
import { closeDbs, ownerDb } from "../src/db/pool";
import { setOtpSender } from "../src/lib/otp-sender";
import { setEmailSender, type EmailMessage } from "../src/lib/email";
import { deliverPending } from "../src/lib/notify";
import { LocalStorage, presignS3, setStorage } from "../src/lib/storage";
import { sweepCalls } from "../src/modules/calls";

let app: FastifyInstance;
let storageDir: string;
const sentCodes = new Map<string, string>();
const emails: EmailMessage[] = [];
let phoneSeq = 0;

type Res = { status: number; body: any; headers: Record<string, unknown> };
type Person = { token: string; personId: string };

async function call(token: string | null, method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", url: string, payload?: unknown, headers: Record<string, string> = {}): Promise<Res> {
  const res = await app.inject({
    method,
    url,
    payload: payload as any,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
  });
  let body: any = null;
  try {
    body = res.body ? JSON.parse(res.body) : null;
  } catch {
    body = res.body;
  }
  return { status: res.statusCode, body, headers: res.headers };
}

async function signIn(name: string): Promise<Person> {
  const phone = `0805${String(++phoneSeq).padStart(7, "0")}`;
  expect((await call(null, "POST", "/auth/otp/request", { phone })).status).toBe(200);
  const v = await call(null, "POST", "/auth/otp/verify", { phone, code: sentCodes.get("+234" + phone.slice(1))! });
  expect(v.status).toBe(200);
  await call(v.body.token, "PATCH", "/me", { fullName: name });
  return { token: v.body.token, personId: v.body.personId };
}

async function emailSignIn(email: string, name: string): Promise<Person> {
  await call(null, "POST", "/auth/email/request", { email });
  const code = [...emails].reverse().find((m) => m.to === email)!.text.match(/\b(\d{6})\b/)![1];
  const v = await call(null, "POST", "/auth/email/verify", { email, code });
  expect(v.status).toBe(200);
  await call(v.body.token, "PATCH", "/me", { fullName: name });
  return { token: v.body.token, personId: v.body.personId };
}

/** A church with an admin and approved members. */
async function church(name: string, memberNames: string[]) {
  const admin = await signIn(`${name} Admin`);
  const c = await call(admin.token, "POST", "/churches", { name, city: "Uyo", participation: "both" });
  expect(c.status).toBe(201);
  const members: Person[] = [];
  for (const n of memberNames) {
    const p = await signIn(n);
    expect((await call(p.token, "POST", "/churches/join", { code: c.body.church.joinCode, participation: "grow" })).status).toBe(201);
    members.push(p);
  }
  for (const m of (await call(admin.token, "GET", "/admin/approvals")).body.members) {
    expect((await call(admin.token, "POST", `/admin/members/${m.membershipId}/approve`, {})).status).toBe(200);
  }
  return { admin, members, churchId: c.body.church.id as string };
}

beforeAll(async () => {
  await migrate({ reset: true });
  setOtpSender({ send: async (phone, code) => void sentCodes.set(phone, code) });
  setEmailSender({ send: async (m) => void emails.push(m) });
  storageDir = await mkdtemp(join(tmpdir(), "daveup-files-"));
  setStorage(new LocalStorage(storageDir));
  app = await buildServer();
  await app.ready();
});

afterAll(async () => {
  await app?.close();
  await closeDbs();
  if (storageDir) await rm(storageDir, { recursive: true, force: true });
});

let grace: Awaited<ReturnType<typeof church>>;
let other: Awaited<ReturnType<typeof church>>;
let ada: Person, ben: Person, cy: Person;

describe("direct messages", () => {
  let dm: string;

  it("sets up two churches", async () => {
    grace = await church("Grace Chapel", ["Ada Obi", "Ben Eze", "Cy Udo"]);
    [ada, ben, cy] = grace.members as [Person, Person, Person];
    other = await church("Other Church", ["Dan Out"]);
  });

  it("lists the church directory without me and without other churches", async () => {
    const r = await call(ada.token, "GET", "/people/directory");
    expect(r.status).toBe(200);
    const names = r.body.map((p: any) => p.fullName);
    expect(names).toContain("Ben Eze");
    expect(names).not.toContain("Ada Obi");
    expect(names).not.toContain("Dan Out");
    expect((await call(ada.token, "GET", "/people/directory?q=ben")).body.map((p: any) => p.fullName)).toEqual(["Ben Eze"]);
  });

  it("opens one direct chat per pair, from either side", async () => {
    const a = await call(ada.token, "POST", "/conversations/direct", { personId: ben.personId });
    expect(a.status).toBe(200);
    expect(a.body).toMatchObject({ kind: "direct", title: "Ben Eze", memberCount: 2, readOnly: false });
    dm = a.body.id;
    const b = await call(ben.token, "POST", "/conversations/direct", { personId: ada.personId });
    expect(b.body.id).toBe(dm);
    expect(b.body.title).toBe("Ada Obi");
  });

  it("refuses chats with yourself or with other churches", async () => {
    expect((await call(ada.token, "POST", "/conversations/direct", { personId: ada.personId })).status).toBe(400);
    expect((await call(ada.token, "POST", "/conversations/direct", { personId: other.members[0]!.personId })).status).toBe(404);
  });

  it("sends, pages, counts unread and marks read", async () => {
    const sent = await call(ada.token, "POST", `/conversations/${dm}/messages`, { body: "Hello Ben", clientId: "7d3f1c9e-4c1e-4b1a-9a57-0d7b0b6f3a11" });
    expect(sent.status).toBe(201);
    expect(sent.body).toMatchObject({ kind: "text", body: "Hello Ben", senderName: "Ada Obi" });
    // A retried send with the same client id is not posted twice.
    const again = await call(ada.token, "POST", `/conversations/${dm}/messages`, { body: "Hello Ben", clientId: "7d3f1c9e-4c1e-4b1a-9a57-0d7b0b6f3a11" });
    expect(again.body.id).toBe(sent.body.id);
    for (let i = 0; i < 55; i++) await call(ada.token, "POST", `/conversations/${dm}/messages`, { body: `Message ${i}` });

    expect((await call(ben.token, "GET", "/conversations/unread")).body.total).toBe(56);
    expect((await call(ada.token, "GET", "/conversations/unread")).body.total).toBe(0);
    const list = (await call(ben.token, "GET", "/conversations")).body;
    expect(list[0]).toMatchObject({ id: dm, unread: 56, lastMessage: { preview: "Message 54", senderName: "Ada Obi" } });

    const page1 = (await call(ben.token, "GET", `/conversations/${dm}/messages`)).body;
    expect(page1.messages).toHaveLength(50);
    expect(page1.hasMore).toBe(true);
    expect(page1.messages.at(-1).body).toBe("Message 54");
    const page2 = (await call(ben.token, "GET", `/conversations/${dm}/messages?before=${page1.messages[0].seq}`)).body;
    expect(page2.messages).toHaveLength(6);
    expect(page2.hasMore).toBe(false);
    expect(page2.messages[0].body).toBe("Hello Ben");
    const newer = (await call(ben.token, "GET", `/conversations/${dm}/messages?after=${page1.messages.at(-2).seq}`)).body;
    expect(newer.messages.map((m: any) => m.body)).toEqual(["Message 54"]);

    expect((await call(ben.token, "POST", `/conversations/${dm}/read`, { seq: page1.messages.at(-1).seq })).status).toBe(200);
    expect((await call(ben.token, "GET", "/conversations/unread")).body.total).toBe(0);
  });

  it("lets only the sender edit, and the sender delete (erasing the text)", async () => {
    const m = (await call(ada.token, "POST", `/conversations/${dm}/messages`, { body: "Typo heer" })).body;
    expect((await call(ben.token, "PATCH", `/messages/${m.id}`, { body: "Hacked" })).status).toBe(403);
    const ed = await call(ada.token, "PATCH", `/messages/${m.id}`, { body: "Typo here" });
    expect(ed.body).toMatchObject({ body: "Typo here" });
    expect(ed.body.editedAt).not.toBeNull();
    expect((await call(ben.token, "GET", `/messages/${m.id}`)).body.body).toBe("Typo here");
    expect((await call(cy.token, "GET", `/messages/${m.id}`)).status).toBe(404);
    expect((await call(ben.token, "DELETE", `/messages/${m.id}`)).status).toBe(403);
    const del = await call(ada.token, "DELETE", `/messages/${m.id}`);
    expect(del.body).toMatchObject({ deleted: true, body: null });
    const stored = await ownerDb.selectFrom("message").select("body").where("id", "=", m.id).executeTakeFirstOrThrow();
    expect(stored.body).toBeNull();
  });

  it("hides the chat from everyone else", async () => {
    expect((await call(cy.token, "GET", `/conversations/${dm}`)).status).toBe(404);
    expect((await call(cy.token, "GET", `/conversations/${dm}/messages`)).status).toBe(404);
    expect((await call(cy.token, "POST", `/conversations/${dm}/messages`, { body: "hi" })).status).toBe(404);
    // Another church's admin cannot see it either, even with the id.
    expect((await call(other.admin.token, "GET", `/conversations/${dm}/messages`)).status).toBe(404);
    expect((await call(grace.admin.token, "GET", `/conversations/${dm}/messages`)).status).toBe(404);
  });

  it("validates messages", async () => {
    expect((await call(ada.token, "POST", `/conversations/${dm}/messages`, { body: "   " })).status).toBe(400);
    expect((await call(ada.token, "POST", `/conversations/${dm}/messages`, { body: "x".repeat(4001) })).status).toBe(400);
  });
});

describe("cells", () => {
  let cell: string;

  it("only church admins create cells, from approved members", async () => {
    expect((await call(ada.token, "POST", "/cells", { name: "Youth", leaderIds: [ada.personId] })).status).toBe(403);
    expect((await call(grace.admin.token, "POST", "/cells", { name: "Youth", leaderIds: [other.members[0]!.personId] })).status).toBe(400);
    const r = await call(grace.admin.token, "POST", "/cells", { name: "Youth Cell", description: "Fridays at 6", leaderIds: [ada.personId], memberIds: [ben.personId] });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ kind: "cell", title: "Youth Cell", memberCount: 2, canManage: true });
    cell = r.body.id;
    await deliverPending(50);
    const mail = emails.filter((e) => e.subject === "You were added to Youth Cell");
    expect(mail).toHaveLength(0); // people signed in by phone have no email: skipped, not sent
    const queued = await ownerDb.selectFrom("notification").select("person_id").where("kind", "=", "cell.added").execute();
    expect(queued.map((q) => q.person_id).sort()).toEqual([ada.personId, ben.personId].sort());
  });

  it("shows the cell to its members, with a system note", async () => {
    const list = (await call(ben.token, "GET", "/conversations")).body;
    expect(list.find((c: any) => c.id === cell)).toMatchObject({ kind: "cell", title: "Youth Cell", myRole: "member" });
    const msgs = (await call(ben.token, "GET", `/conversations/${cell}/messages`)).body.messages;
    expect(msgs[0]).toMatchObject({ kind: "system", body: "Grace Chapel Admin created Youth Cell" });
    expect((await call(cy.token, "GET", `/conversations/${cell}`)).status).toBe(404);
    // The admin manages the cell without being in it, but cannot read its messages.
    expect((await call(grace.admin.token, "GET", `/conversations/${cell}`)).body).toMatchObject({ canManage: true });
    expect((await call(grace.admin.token, "GET", `/conversations/${cell}/messages`)).status).toBe(404);
    const all = (await call(grace.admin.token, "GET", "/cells")).body;
    expect(all[0]).toMatchObject({ name: "Youth Cell", memberCount: 2, iAmMember: false, leaders: [{ fullName: "Ada Obi" }] });
  });

  it("leaders add members; plain members cannot", async () => {
    expect((await call(ben.token, "POST", `/cells/${cell}/members`, { personIds: [cy.personId] })).status).toBe(403);
    await call(ben.token, "POST", `/conversations/${cell}/messages`, { body: "Before Cy joined" });
    const r = await call(ada.token, "POST", `/cells/${cell}/members`, { personIds: [cy.personId] });
    expect(r.status).toBe(200);
    expect(r.body.memberCount).toBe(3);
    // Cy sees the history but starts caught up.
    expect((await call(cy.token, "GET", "/conversations/unread")).body.total).toBe(0);
    expect((await call(cy.token, "GET", `/conversations/${cell}/messages`)).body.messages.map((m: any) => m.body)).toContain("Before Cy joined");
  });

  it("keeps at least one leader, and lets members leave", async () => {
    expect((await call(ada.token, "PATCH", `/cells/${cell}/members/${ada.personId}`, { role: "member" })).status).toBe(409);
    expect((await call(ada.token, "DELETE", `/cells/${cell}/members/${ada.personId}`)).status).toBe(409);
    expect((await call(ada.token, "PATCH", `/cells/${cell}/members/${ben.personId}`, { role: "leader" })).body.members.find((m: any) => m.personId === ben.personId).role).toBe("leader");
    expect((await call(cy.token, "DELETE", `/cells/${cell}/members/${cy.personId}`)).status).toBe(200);
    expect((await call(cy.token, "GET", `/conversations/${cell}/messages`)).status).toBe(404);
  });

  it("lets leaders delete any message in the cell", async () => {
    const m = (await call(ada.token, "POST", `/conversations/${cell}/messages`, { body: "Off topic" })).body;
    expect((await call(ben.token, "DELETE", `/messages/${m.id}`)).body.deleted).toBe(true);
  });

  it("archives a cell as read-only", async () => {
    expect((await call(ada.token, "POST", `/cells/${cell}/archive`)).status).toBe(403);
    expect((await call(grace.admin.token, "POST", `/cells/${cell}/archive`)).body.archived).toBe(true);
    expect((await call(ada.token, "POST", `/conversations/${cell}/messages`, { body: "hello?" })).status).toBe(403);
    expect((await call(ada.token, "GET", `/conversations/${cell}/messages`)).status).toBe(200);
    expect((await call(grace.admin.token, "POST", `/cells/${cell}/unarchive`)).body.archived).toBe(false);
  });
});

describe("files", () => {
  let dm: string;
  let fileId: string;

  it("uploads, confirms and posts a file", async () => {
    dm = (await call(ada.token, "POST", "/conversations/direct", { personId: ben.personId })).body.id;
    const content = "Notes for Sunday\n";
    const t = await call(ada.token, "POST", `/conversations/${dm}/files`, { name: "../../notes.txt", mime: "text/plain", size: Buffer.byteLength(content) });
    expect(t.status).toBe(201);
    fileId = t.body.fileId;
    expect(t.body.uploadUrl).toBe(`/api/files/${fileId}/content`);
    // Only the uploader can send the bytes.
    expect((await call(ben.token, "PUT", `/files/${fileId}/content`, content, { "content-type": "text/plain" })).status).toBe(404);
    expect((await call(ada.token, "POST", `/files/${fileId}/complete`, {})).status).toBe(400); // nothing uploaded yet
    expect((await call(ada.token, "PUT", `/files/${fileId}/content`, content, { "content-type": "text/plain" })).status).toBe(200);
    const done = await call(ada.token, "POST", `/files/${fileId}/complete`, { caption: "Sunday notes" });
    expect(done.status).toBe(201);
    expect(done.body).toMatchObject({ kind: "file", body: "Sunday notes", file: { name: "notes.txt", size: content.length, url: `/api/files/${fileId}/download` } });
    expect((await call(ada.token, "POST", `/files/${fileId}/complete`, {})).status).toBe(409);
  });

  it("parses JSON files as bytes, not as a request body", async () => {
    const json = '{"a":1}';
    const t = (await call(ada.token, "POST", `/conversations/${dm}/files`, { name: "data.json", mime: "application/json", size: json.length })).body;
    expect((await call(ada.token, "PUT", `/files/${t.fileId}/content`, json, { "content-type": "application/json" })).status).toBe(200);
    expect((await call(ada.token, "POST", `/files/${t.fileId}/complete`, {})).status).toBe(201);
  });

  it("refuses an upload larger than declared", async () => {
    const t = (await call(ada.token, "POST", `/conversations/${dm}/files`, { name: "a.txt", mime: "text/plain", size: 3 })).body;
    expect((await call(ada.token, "PUT", `/files/${t.fileId}/content`, "too long", { "content-type": "text/plain" })).status).toBe(400);
  });

  it("serves files only to people in the conversation, never inline when unsafe", async () => {
    const r = await call(ben.token, "GET", `/files/${fileId}/download?inline=1`);
    expect(r.status).toBe(200);
    expect(r.body).toBe("Notes for Sunday\n");
    expect(r.headers["content-type"]).toBe("application/octet-stream"); // text is never rendered inline
    expect(String(r.headers["content-disposition"])).toContain('attachment; filename="notes.txt"');
    expect((await call(cy.token, "GET", `/files/${fileId}/download`)).status).toBe(403);
    expect((await call(other.admin.token, "GET", `/files/${fileId}/download`)).status).toBe(404);
    const list = (await call(ben.token, "GET", `/conversations/${dm}/files`)).body;
    expect(list.map((f: any) => f.name)).toEqual(["data.json", "notes.txt"]);
  });

  it("removes the file when its message is deleted", async () => {
    const msg = await ownerDb.selectFrom("message").select("id").where("file_id", "=", fileId).executeTakeFirstOrThrow();
    expect((await call(ada.token, "DELETE", `/messages/${msg.id}`)).status).toBe(200);
    expect((await call(ben.token, "GET", `/files/${fileId}/download`)).status).toBe(404);
  });

  it("caps file size", async () => {
    expect((await call(ada.token, "POST", `/conversations/${dm}/files`, { name: "big.mp4", mime: "video/mp4", size: 51 * 1024 * 1024 })).status).toBe(400);
  });

  it("signs S3 URLs exactly as AWS documents", () => {
    // Example from the AWS docs, "Authenticating Requests: Using Query Parameters".
    const url = presignS3(
      { endpoint: "https://s3.amazonaws.com", region: "us-east-1", bucket: "examplebucket", accessKeyId: "AKIAIOSFODNN7EXAMPLE", secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY", virtualHosted: true },
      "GET",
      "test.txt",
      86400,
      {},
      new Date("2013-05-24T00:00:00Z"),
    );
    expect(url).toContain("X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404");
  });
});

describe("calls", () => {
  let cell: string;
  const rooms = new Map<string, string[]>();

  it("are off until LiveKit is configured", async () => {
    const dm = (await call(ada.token, "POST", "/conversations/direct", { personId: ben.personId })).body.id;
    expect((await call(ada.token, "GET", "/chat/features")).body).toMatchObject({ calls: false, files: true });
    const r = await call(ada.token, "POST", `/conversations/${dm}/calls`, { media: "video" });
    expect(r.status).toBe(503);
    expect(r.body.error.code).toBe("CALLS_UNAVAILABLE");
  });

  it("start, ring, join and end a cell call", async () => {
    Object.assign(config.livekit, { url: "wss://livekit.test", apiKey: "APIkey", apiSecret: "secret-for-tests-only" });
    // Stand-in for LiveKit's room service.
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (!url.startsWith("https://livekit.test/twirp/")) throw new Error(`unexpected fetch ${url}`);
      const body = JSON.parse(String(init?.body));
      if (url.endsWith("/ListParticipants")) return new Response(JSON.stringify({ participants: (rooms.get(body.room) ?? []).map((identity) => ({ identity })) }));
      return new Response("{}");
    });

    cell = (await call(grace.admin.token, "POST", "/cells", { name: "Prayer Cell", leaderIds: [ada.personId], memberIds: [ben.personId, cy.personId] })).body.id;
    const start = await call(ada.token, "POST", `/conversations/${cell}/calls`, { media: "video" });
    expect(start.status).toBe(201);
    expect(start.body.url).toBe("wss://livekit.test");
    const [h, p, sig] = start.body.token.split(".");
    expect(createHmac("sha256", "secret-for-tests-only").update(`${h}.${p}`).digest("base64url")).toBe(sig);
    const claims = JSON.parse(Buffer.from(p, "base64url").toString());
    expect(claims).toMatchObject({ iss: "APIkey", sub: ada.personId, name: "Ada Obi", video: { roomJoin: true, room: `daveup-${start.body.call.id}` } });
    const callId = start.body.call.id;
    rooms.set(`daveup-${callId}`, [ada.personId]);

    // Pressing call again joins the same call.
    const ben1 = await call(ben.token, "POST", `/conversations/${cell}/calls`, { media: "audio" });
    expect(ben1.body.call.id).toBe(callId);
    rooms.set(`daveup-${callId}`, [ada.personId, ben.personId]);
    expect((await call(cy.token, "GET", "/conversations")).body.find((c: any) => c.id === cell).activeCall).toMatchObject({ id: callId, participantCount: 2, startedByName: "Ada Obi" });
    expect((await call(other.admin.token, "POST", `/calls/${callId}/join`)).status).toBe(404);

    // Ada leaves: Ben is still there, so it carries on.
    expect((await call(ada.token, "POST", `/calls/${callId}/leave`)).body.ended).toBe(false);
    rooms.set(`daveup-${callId}`, [ben.personId]);
    // Ben closes his tab without leaving: the sweeper ends the call once the room is empty.
    rooms.set(`daveup-${callId}`, []);
    await ownerDb.updateTable("call_session").set({ started_at: new Date(Date.now() - 120_000) }).where("id", "=", callId).execute();
    expect(await sweepCalls()).toBe(1);
    const msg = (await call(cy.token, "GET", `/conversations/${cell}/messages`)).body.messages.find((m: any) => m.kind === "call");
    expect(msg.call).toMatchObject({ id: callId, media: "video", answered: true, ended: true });
    expect(msg.call.durationSeconds).toBeGreaterThanOrEqual(0);
    expect((await call(ben.token, "POST", `/calls/${callId}/join`)).status).toBe(409);
  });

  it("ends a declined or unanswered one-to-one call", async () => {
    const dm = (await call(ada.token, "POST", "/conversations/direct", { personId: ben.personId })).body.id;
    const c1 = (await call(ada.token, "POST", `/conversations/${dm}/calls`, { media: "audio" })).body.call.id;
    expect((await call(ben.token, "POST", `/calls/${c1}/decline`)).body.ended).toBe(true);
    const c2 = (await call(ada.token, "POST", `/conversations/${dm}/calls`, { media: "audio" })).body.call.id;
    expect(c2).not.toBe(c1);
    await ownerDb.updateTable("call_session").set({ started_at: new Date(Date.now() - 60_000) }).where("id", "=", c2).execute();
    expect(await sweepCalls()).toBe(1);
    const m = (await call(ben.token, "GET", `/conversations/${dm}/messages`)).body.messages.filter((x: any) => x.kind === "call");
    expect(m.map((x: any) => x.call.answered)).toEqual([false, false]);
    vi.restoreAllMocks();
    Object.assign(config.livekit, { url: "", apiKey: "", apiSecret: "" });
  });
});

describe("realtime", () => {
  it("refuses sockets without a session", async () => {
    await expect(app.injectWS("/realtime")).rejects.toThrow();
  });

  it("pushes new messages and typing to the other person only", async () => {
    const dm = (await call(ada.token, "POST", "/conversations/direct", { personId: ben.personId })).body.id;
    const benWs = await app.injectWS("/realtime", { headers: { authorization: `Bearer ${ben.token}` } });
    const cyWs = await app.injectWS("/realtime", { headers: { authorization: `Bearer ${cy.token}` } });
    const adaWs = await app.injectWS("/realtime", { headers: { authorization: `Bearer ${ada.token}` } });
    const got: Record<string, any[]> = { ben: [], cy: [] };
    benWs.on("message", (d) => got.ben!.push(JSON.parse(String(d))));
    cyWs.on("message", (d) => got.cy!.push(JSON.parse(String(d))));
    const sent = (await call(ada.token, "POST", `/conversations/${dm}/messages`, { body: "Live!" })).body;
    adaWs.send(JSON.stringify({ type: "typing", conversationId: dm }));
    await vi.waitFor(() => {
      expect(got.ben!.some((e) => e.type === "message" && e.seq === sent.seq)).toBe(true);
      expect(got.ben!.some((e) => e.type === "typing" && e.name === "Ada Obi")).toBe(true);
    }, { timeout: 3000 });
    expect(got.cy!.filter((e) => e.type === "message" || e.type === "typing")).toEqual([]);
    for (const w of [benWs, cyWs, adaWs]) w.terminate();
  });
});

describe("staff console", () => {
  let staff: Person;

  it("is closed to church admins", async () => {
    expect((await call(grace.admin.token, "GET", "/staff/overview")).status).toBe(403);
    expect((await call(null, "GET", "/staff/overview")).status).toBe(401);
  });

  it("opens to verified emails in SUPER_ADMIN_EMAILS", async () => {
    (config.superAdminEmails as string[]).push("staff@daveup.test");
    staff = await emailSignIn("staff@daveup.test", "Sam Staff");
    expect((await call(staff.token, "GET", "/me")).body.person.isSuperAdmin).toBe(true);
    const ov = (await call(staff.token, "GET", "/staff/overview")).body;
    expect(ov.churches).toMatchObject({ total: 2, unverified: 2 });
    expect(ov.cells).toBe(2);
    expect(ov.messagesLast7Days).toBeGreaterThan(50);
    const list = (await call(staff.token, "GET", "/staff/churches")).body;
    expect(list.find((c: any) => c.name === "Grace Chapel")).toMatchObject({ members: 4, cells: 2, admins: [{ fullName: "Grace Chapel Admin" }] });
  });

  it("verifies a church and tells its admins", async () => {
    const r = await call(staff.token, "POST", `/staff/churches/${grace.churchId}/status`, { status: "verified" });
    expect(r.body).toMatchObject({ status: "verified" });
    expect(r.body.verifiedAt).not.toBeNull();
    const n = await ownerDb.selectFrom("notification").select("person_id").where("kind", "=", "church.verified").execute();
    expect(n.map((x) => x.person_id)).toEqual([grace.admin.personId]);
    expect((await call(staff.token, "POST", `/staff/churches/${grace.churchId}/plan`, { plan: "pro" })).body.plan).toBe("pro");
  });

  it("suspends a church, which locks its members out, then reinstates it", async () => {
    expect((await call(staff.token, "POST", `/staff/churches/${other.churchId}/status`, { status: "suspended" })).status).toBe(400); // reason required
    expect((await call(staff.token, "POST", `/staff/churches/${other.churchId}/status`, { status: "suspended", reason: "Not a real church" })).status).toBe(200);
    const blocked = await call(other.members[0]!.token, "GET", "/conversations");
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe("CHURCH_SUSPENDED");
    expect((await call(other.members[0]!.token, "GET", "/me")).body.membership.churchStatus).toBe("suspended");
    expect((await call(ada.token, "GET", "/conversations")).status).toBe(200); // other churches unaffected
    await call(staff.token, "POST", `/staff/churches/${other.churchId}/status`, { status: "verified" });
    expect((await call(other.members[0]!.token, "GET", "/conversations")).status).toBe(200);
    const detail = (await call(staff.token, "GET", `/staff/churches/${other.churchId}`)).body;
    expect(detail.recentActivity.map((a: any) => a.action)).toEqual(expect.arrayContaining(["staff.church_suspended", "staff.church_verified"]));
  });

  it("finds people and grants and removes staff access", async () => {
    const found = (await call(staff.token, "GET", "/staff/people?q=ada")).body;
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ fullName: "Ada Obi", church: { name: "Grace Chapel" }, isSuperAdmin: false });
    // Staff need a verified email.
    expect((await call(staff.token, "POST", "/staff/super-admins", { personId: ada.personId, grant: true })).status).toBe(400);
    const eve = await emailSignIn("eve@daveup.test", "Eve Staff");
    expect((await call(staff.token, "POST", "/staff/super-admins", { personId: eve.personId, grant: true })).status).toBe(200);
    expect((await call(eve.token, "GET", "/staff/overview")).status).toBe(200);
    // Config staff cannot be removed in the app, and nobody removes themselves.
    expect((await call(eve.token, "POST", "/staff/super-admins", { personId: staff.personId, grant: false })).status).toBe(409);
    expect((await call(eve.token, "POST", "/staff/super-admins", { personId: eve.personId, grant: false })).status).toBe(400);
    expect((await call(staff.token, "POST", "/staff/super-admins", { personId: eve.personId, grant: false })).status).toBe(200);
    expect((await call(eve.token, "GET", "/staff/overview")).status).toBe(403);
    const staffList = (await call(staff.token, "GET", "/staff/people?staff=1")).body;
    expect(staffList.map((p: any) => p.fullName)).toEqual(["Sam Staff"]);
    const log = (await call(staff.token, "GET", "/staff/audit")).body;
    expect(log.map((a: any) => a.action)).toEqual(expect.arrayContaining(["staff.granted", "staff.revoked", "staff.church_suspended"]));
  });
});
