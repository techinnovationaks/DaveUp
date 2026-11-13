// End-to-end test of the core loop through the HTTP API, against the
// daveup_test database (reset before the run). Fixtures here exist only in
// the test database.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { itemsFor, isoDay, addDays, questionsFor } from "@daveup/shared";
import { migrate } from "../src/db/migrate";
import { buildServer } from "../src/server";
import { closeDbs, ownerDb, withTenant } from "../src/db/pool";
import { setOtpSender } from "../src/lib/otp-sender";

let app: FastifyInstance;
const sentCodes = new Map<string, string>();
let phoneSeq = 0;

beforeAll(async () => {
  await migrate({ reset: true });
  setOtpSender({ send: async (phone, code) => void sentCodes.set(phone, code) });
  app = await buildServer();
});

afterAll(async () => {
  await app?.close();
  await closeDbs();
});

type Res = { status: number; body: any };

async function call(token: string | null, method: "GET" | "POST" | "PUT" | "PATCH", url: string, payload?: unknown): Promise<Res> {
  const res = await app.inject({
    method,
    url,
    payload: payload as any,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : null };
}

async function signIn(name: string): Promise<{ token: string; personId: string }> {
  const phone = `0803${String(++phoneSeq).padStart(7, "0")}`;
  expect((await call(null, "POST", "/auth/otp/request", { phone })).status).toBe(200);
  const e164 = "+234" + phone.slice(1);
  const code = sentCodes.get(e164)!;
  const v = await call(null, "POST", "/auth/otp/verify", { phone, code });
  expect(v.status).toBe(200);
  await call(v.body.token, "PATCH", "/me", { fullName: name });
  return { token: v.body.token, personId: v.body.personId };
}

async function answerAll(token: string, assessmentId: string, version: "A" | "B", value: (area: number) => number) {
  for (const q of questionsFor(version)) {
    const r = await call(token, "PUT", `/assessments/${assessmentId}/answers/${q.id}`, { value: value(q.area), noOccasion: false });
    expect(r.status).toBe(200);
  }
}

describe("auth", () => {
  it("rejects a wrong code and never returns the code over HTTP", async () => {
    const req = await call(null, "POST", "/auth/otp/request", { phone: "08039999999" });
    expect(req.status).toBe(200);
    expect(JSON.stringify(req.body)).not.toContain(sentCodes.get("+2348039999999")!);
    const bad = await call(null, "POST", "/auth/otp/verify", { phone: "08039999999", code: "000000" === sentCodes.get("+2348039999999") ? "111111" : "000000" });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("OTP_WRONG");
  });

  it("requires sign-in", async () => {
    expect((await call(null, "GET", "/me")).status).toBe(401);
  });

  it("refuses phone-only sign-in while codes are on", async () => {
    expect((await call(null, "GET", "/auth/methods")).body).toEqual({ otp: true });
    const r = await call(null, "POST", "/auth/phone", { phone: "08039999998" });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe("OTP_REQUIRED");
  });

  it("signs in by phone number alone while codes are off", async () => {
    const capture = { send: async (phone: string, code: string) => void sentCodes.set(phone, code) };
    setOtpSender(null);
    try {
      expect((await call(null, "GET", "/auth/methods")).body).toEqual({ otp: false });
      expect((await call(null, "POST", "/auth/otp/request", { phone: "08039999997" })).body.error.code).toBe("OTP_DISABLED");

      const first = await call(null, "POST", "/auth/phone", { phone: "0803 999 9997" });
      expect(first.status).toBe(200);
      expect(first.body.isNew).toBe(true);
      expect((await call(first.body.token, "GET", "/me")).status).toBe(200);

      // Same number, same person.
      const again = await call(null, "POST", "/auth/phone", { phone: "+2348039999997" });
      expect(again.body.personId).toBe(first.body.personId);
      expect(again.body.isNew).toBe(false);

      expect((await call(null, "POST", "/auth/phone", { phone: "12345" })).status).toBe(400);
    } finally {
      setOtpSender(capture);
    }
  });
});

describe("core discipleship loop", () => {
  let admin: { token: string; personId: string };
  let discipler: { token: string; personId: string };
  let disciple: { token: string; personId: string };
  let outsider: { token: string; personId: string };
  let joinCode: string;
  let churchId: string;
  let relId: string;

  it("registers a church; the registrant is its admin", async () => {
    admin = await signIn("Admin Person");
    const r = await call(admin.token, "POST", "/churches", { name: "Test Church", city: "Uyo", participation: "both" });
    expect(r.status).toBe(201);
    joinCode = r.body.church.joinCode;
    churchId = r.body.church.id;
    expect(joinCode).toMatch(/^[A-Z2-9]{8}$/);
    expect(r.body.me.membership).toMatchObject({ status: "approved", isAdmin: true });
  });

  it("members join by code and wait for approval", async () => {
    discipler = await signIn("Discipler Person");
    disciple = await signIn("Disciple Person");
    for (const p of [discipler, disciple]) {
      const lookup = await call(p.token, "GET", `/churches/lookup?code=${joinCode}`);
      expect(lookup.body.name).toBe("Test Church");
      const j = await call(p.token, "POST", "/churches/join", { code: joinCode, participation: "both" });
      expect(j.status).toBe(201);
      expect(j.body.membership.status).toBe("pending");
      // pending members cannot use church features
      expect((await call(p.token, "GET", "/disciplers")).status).toBe(403);
    }
    const approvals = await call(admin.token, "GET", "/admin/approvals");
    expect(approvals.body.members).toHaveLength(2);
    expect((await call(discipler.token, "GET", "/admin/approvals")).status).toBe(403);
    for (const m of approvals.body.members) {
      expect((await call(admin.token, "POST", `/admin/members/${m.membershipId}/approve`, {})).status).toBe(200);
    }
  });

  it("discipler status needs admin approval", async () => {
    expect((await call(discipler.token, "POST", "/discipler-status/request")).status).toBe(201);
    expect((await call(disciple.token, "GET", "/disciplers")).body).toEqual([]);
    const approvals = await call(admin.token, "GET", "/admin/approvals");
    const reqId = approvals.body.disciplerRequests[0].id;
    expect((await call(admin.token, "POST", `/admin/discipler-status/${reqId}/approve`, {})).status).toBe(200);
    const list = await call(disciple.token, "GET", "/disciplers");
    expect(list.body).toEqual([expect.objectContaining({ personId: discipler.personId, placesFilled: 0, placesTotal: 12 })]);
  });

  it("disciple requests; only the discipler can accept", async () => {
    const noConsent = await call(disciple.token, "POST", "/relationships", { disciplerId: discipler.personId });
    expect(noConsent.status).toBe(400);
    const r = await call(disciple.token, "POST", "/relationships", { disciplerId: discipler.personId, disclosureConfirmed: true });
    expect(r.status).toBe(201);
    relId = r.body.id;
    expect(r.body).toMatchObject({ status: "requested", myRole: "disciple", awaiting: "them" });
    expect((await call(disciple.token, "POST", `/relationships/${relId}/accept`, {})).status).toBe(403);
    const acc = await call(discipler.token, "POST", `/relationships/${relId}/accept`, {});
    expect(acc.status).toBe(200);
    expect(acc.body).toMatchObject({ status: "accepted_baseline_pending", awaiting: "both" });
    expect((await call(disciple.token, "GET", `/relationships/${relId}/comparison`)).status).toBe(403);
  });

  it("baselines are completed independently and revealed together", async () => {
    const b = await call(disciple.token, "POST", "/assessments", { version: "B" });
    expect(b.status).toBe(201);
    // the discipler cannot open the disciple's answers
    expect((await call(discipler.token, "GET", `/assessments/${b.body.id}`)).status).toBe(404);
    expect((await call(disciple.token, "POST", `/assessments/${b.body.id}/submit`)).body.error.code).toBe("INCOMPLETE");
    await answerAll(disciple.token, b.body.id, "B", (area) => (area === 4 ? 4 : 3));
    // one "No occasion yet"
    await call(disciple.token, "PUT", `/assessments/${b.body.id}/answers/12B-1`, { value: null, noOccasion: true });
    const sub = await call(disciple.token, "POST", `/assessments/${b.body.id}/submit`);
    expect(sub.body.status).toBe("submitted");

    let rel = await call(disciple.token, "GET", `/relationships/${relId}`);
    expect(rel.body).toMatchObject({ status: "accepted_baseline_pending", awaiting: "them" });

    const hub = await call(discipler.token, "GET", "/assessments");
    expect(hub.body.testAsOwed).toHaveLength(1);
    const a = await call(discipler.token, "POST", "/assessments", { version: "A", relationshipId: relId });
    expect(a.status).toBe(201);
    await answerAll(discipler.token, a.body.id, "A", (area) => (area === 4 ? 2 : 3));
    expect((await call(discipler.token, "POST", `/assessments/${a.body.id}/submit`)).status).toBe(200);

    rel = await call(disciple.token, "GET", `/relationships/${relId}`);
    expect(rel.body.status).toBe("active");

    const cmp = await call(disciple.token, "GET", `/relationships/${relId}/comparison`);
    expect(cmp.status).toBe(200);
    const prayer = cmp.body.areas.find((x: any) => x.area === 4);
    expect(prayer).toMatchObject({ disciple: 20, discipler: 10, gap: "large" });
    expect(cmp.body.discussFirst[0]).toBe(4);
    expect(cmp.body.suggestion.area).toBe(4);
    expect((await call(discipler.token, "GET", `/relationships/${relId}/comparison`)).status).toBe(200);
  });

  it("people outside the relationship cannot see it", async () => {
    outsider = await signIn("Outsider Person");
    const j = await call(outsider.token, "POST", "/churches/join", { code: joinCode, participation: "grow" });
    await call(admin.token, "POST", `/admin/members/${(await call(admin.token, "GET", "/admin/approvals")).body.members[0].membershipId}/approve`, {});
    expect(j.status).toBe(201);
    expect((await call(outsider.token, "GET", `/relationships/${relId}/comparison`)).status).toBe(404);
    expect((await call(admin.token, "GET", `/relationships/${relId}/comparison`)).status).toBe(404);
  });

  it("admins see every registered member with roles and connections; members cannot", async () => {
    const list = await call(admin.token, "GET", "/admin/members");
    expect(list.status).toBe(200);
    const byId = new Map<string, any>(list.body.map((m: any) => [m.personId, m]));
    expect(byId.get(admin.personId).isAdmin).toBe(true);
    expect(byId.get(discipler.personId).disciplerStatus).toBe("approved");
    expect(byId.get(discipler.personId).disciplesCount).toBe(1);
    expect(byId.get(disciple.personId).discipler.personId).toBe(discipler.personId);
    expect(byId.get(outsider.personId).status).toBe("approved");
    // Roles and connections only: nothing from assessments.
    expect(JSON.stringify(list.body)).not.toMatch(/score|answer|evidence/i);

    expect((await call(disciple.token, "GET", "/admin/members")).status).toBe(403);

    const ov = await call(admin.token, "GET", "/admin/overview");
    expect(ov.status).toBe(200);
    expect(ov.body.church.joinCode).toBe(joinCode);
    expect(ov.body.members).toBe(list.body.filter((m: any) => m.status === "approved").length);
    expect(ov.body.disciplers).toBe(1);
    expect(ov.body.activeRelationships).toBe(1);
    expect(ov.body.withoutDiscipler).toBe(ov.body.members - 1);
    expect((await call(disciple.token, "GET", "/admin/overview")).status).toBe(403);
  });

  it("row-level security isolates churches", async () => {
    const otherAdmin = await signIn("Other Admin");
    const other = await call(otherAdmin.token, "POST", "/churches", { name: "Other Church", city: "Lagos", participation: "both" });
    const seenFromOther = await withTenant(other.body.church.id, (tx) => tx.selectFrom("relationship").select("id").execute());
    expect(seenFromOther).toEqual([]);
    const seenFromOwn = await withTenant(churchId, (tx) => tx.selectFrom("relationship").select("id").execute());
    expect(seenFromOwn.map((r) => r.id)).toContain(relId);
    // other church's admin cannot see this church's members
    expect((await call(otherAdmin.token, "GET", "/admin/approvals")).body.members).toEqual([]);
    const otherMembers = (await call(otherAdmin.token, "GET", "/admin/members")).body;
    expect(otherMembers.map((m: any) => m.personId)).toEqual([otherAdmin.personId]);
  });

  it("caps a discipler at 12 disciples", async () => {
    // relId already holds one place; fill 11 more, then the 13th must fail.
    const extra: { token: string; personId: string }[] = [];
    for (let i = 0; i < 12; i++) {
      const p = await signIn(`Extra Disciple ${i}`);
      await call(p.token, "POST", "/churches/join", { code: joinCode, participation: "grow" });
      extra.push(p);
    }
    for (const m of (await call(admin.token, "GET", "/admin/approvals")).body.members) {
      await call(admin.token, "POST", `/admin/members/${m.membershipId}/approve`, {});
    }
    // discipler invites; each disciple accepts with disclosure
    const results: number[] = [];
    for (const p of extra) {
      const inv = await call(discipler.token, "POST", "/relationships", { discipleId: p.personId });
      expect(inv.status).toBe(201);
      expect((await call(p.token, "POST", `/relationships/${inv.body.id}/accept`, {})).body.error.code).toBe("DISCLOSURE_REQUIRED");
      results.push((await call(p.token, "POST", `/relationships/${inv.body.id}/accept`, { disclosureConfirmed: true })).status);
    }
    expect(results.slice(0, 11).every((s) => s === 200)).toBe(true);
    expect(results[11]).toBe(409);
    const list = await call(outsider.token, "GET", "/disciplers");
    expect(list.body[0]).toMatchObject({ placesFilled: 12 });
  });

  it("a disciple can always end the relationship, including with a concern", async () => {
    const r = await call(disciple.token, "POST", `/relationships/${relId}/end`, { reason: "concern", note: "test" });
    expect(r.status).toBe(200);
    const rel = await call(disciple.token, "GET", `/relationships/${relId}`);
    expect(rel.body.status).toBe("ended");
    const log = await withTenant(churchId, (tx) => tx.selectFrom("audit_log").select("action").where("target_id", "=", relId).execute());
    expect(log.map((l) => l.action)).toEqual(expect.arrayContaining(["relationship.requested", "relationship.accepted", "relationship.activated", "relationship.ended_with_concern"]));
  });
});

describe("monthly cycle, growth plan and meetings", () => {
  let lead: { token: string; personId: string };
  let member: { token: string; personId: string };
  let stranger: { token: string; personId: string };
  let relId: string;
  let otherChurchId: string;
  const DAY = 86_400_000;
  const backdate = (days: number) =>
    ownerDb.updateTable("relationship").set({ activated_at: new Date(Date.now() - days * DAY) }).where("id", "=", relId).execute();

  it("sets up an active pair in a new church", async () => {
    lead = await signIn("Lead Pastor");
    const church = await call(lead.token, "POST", "/churches", { name: "Cycle Church", city: "Calabar", participation: "both" });
    await call(lead.token, "POST", "/discipler-status/request");
    const reqId = (await call(lead.token, "GET", "/admin/approvals")).body.disciplerRequests[0].id;
    await call(lead.token, "POST", `/admin/discipler-status/${reqId}/approve`, {});
    member = await signIn("Cycle Member");
    await call(member.token, "POST", "/churches/join", { code: church.body.church.joinCode, participation: "grow" });
    const m = (await call(lead.token, "GET", "/admin/approvals")).body.members[0];
    await call(lead.token, "POST", `/admin/members/${m.membershipId}/approve`, {});
    relId = (await call(member.token, "POST", "/relationships", { disciplerId: lead.personId, disclosureConfirmed: true })).body.id;
    await call(lead.token, "POST", `/relationships/${relId}/accept`, {});

    // Plans and progress stay closed until both baselines are in.
    expect((await call(member.token, "GET", `/relationships/${relId}/plan`)).body.error.code).toBe("NOT_ACTIVE");

    const b = await call(member.token, "POST", "/assessments", { version: "B" });
    await answerAll(member.token, b.body.id, "B", (area) => (area === 4 ? 1 : 3));
    await call(member.token, "POST", `/assessments/${b.body.id}/submit`);
    const a = await call(lead.token, "POST", "/assessments", { version: "A", relationshipId: relId });
    await answerAll(lead.token, a.body.id, "A", (area) => (area === 4 ? 1 : 3));
    await call(lead.token, "POST", `/assessments/${a.body.id}/submit`);
    expect((await call(member.token, "GET", `/relationships/${relId}`)).body.status).toBe("active");

    stranger = await signIn("Other Church Admin");
    otherChurchId = (await call(stranger.token, "POST", "/churches", { name: "Elsewhere", city: "Aba", participation: "both" })).body.church.id;
  });

  it("opens no check in the first weeks, then a 12-question check a week before it is due", async () => {
    let p = await call(member.token, "GET", `/relationships/${relId}/progress`);
    expect(p.status).toBe(200);
    expect(p.body.current).toBeNull();
    expect(p.body.points).toHaveLength(1);
    expect(p.body.nextDueOn).toBeTruthy();

    await backdate(28);
    p = await call(member.token, "GET", `/relationships/${relId}/progress`);
    expect(p.body.current).toMatchObject({ number: 1, kind: "check", mine: null, theirs: "not_started" });

    const mineHub = await call(member.token, "GET", "/assessments");
    expect(mineHub.body.checks).toEqual([expect.objectContaining({ role: "self", number: 1, kind: "check", assessment: null })]);
    expect(mineHub.body.myTestB.kind).toBe("full"); // the baseline, not the check
    const leadHub = await call(lead.token, "GET", "/assessments");
    expect(leadHub.body.checks).toEqual([expect.objectContaining({ role: "about", person: expect.objectContaining({ personId: member.personId }) })]);
  });

  it("each answers the check alone; it completes when both have finished", async () => {
    const cycleId = (await call(member.token, "GET", `/relationships/${relId}/progress`)).body.current.id;
    const b = await call(member.token, "POST", `/cycles/${cycleId}/start`);
    expect(b.status).toBe(201);
    expect(b.body).toMatchObject({ version: "B", kind: "check", itemIndex: 1, cycleNumber: 1 });
    expect(b.body.progress.total).toBe(12);
    // Starting again resumes the same one.
    expect((await call(member.token, "POST", `/cycles/${cycleId}/start`)).body.id).toBe(b.body.id);
    // A question outside this month's set is refused.
    expect((await call(member.token, "PUT", `/assessments/${b.body.id}/answers/4B-2`, { value: 3 })).body.error.code).toBe("BAD_ITEM");
    for (const q of itemsFor("B", { kind: "check", itemIndex: 1 })) {
      expect((await call(member.token, "PUT", `/assessments/${b.body.id}/answers/${q.id}`, { value: q.area === 4 ? 4 : 3 })).status).toBe(200);
    }
    expect((await call(member.token, "POST", `/assessments/${b.body.id}/submit`)).body.status).toBe("submitted");

    // Not revealed yet: still only the baseline.
    let p = await call(lead.token, "GET", `/relationships/${relId}/progress`);
    expect(p.body.points).toHaveLength(1);
    expect(p.body.current.theirs).toBe("submitted");
    expect((await call(lead.token, "GET", `/assessments/${b.body.id}`)).status).toBe(404);

    const a = await call(lead.token, "POST", `/cycles/${cycleId}/start`);
    expect(a.body).toMatchObject({ version: "A", kind: "check" });
    for (const q of itemsFor("A", { kind: "check", itemIndex: 1 })) {
      await call(lead.token, "PUT", `/assessments/${a.body.id}/answers/${q.id}`, { value: q.area === 4 ? 4 : 3 });
    }
    await call(lead.token, "POST", `/assessments/${a.body.id}/submit`);

    p = await call(member.token, "GET", `/relationships/${relId}/progress`);
    expect(p.body.points.map((x: any) => x.label)).toEqual(["Baseline", "Monthly check"]);
    expect(p.body.summary.improved).toContain(4);
    expect(p.body.summary.text).toContain("strongest observable progress has been in Prayer");
    expect(p.body.current).toBeNull();
    const cmp = await call(member.token, "GET", `/relationships/${relId}/comparison`);
    expect(cmp.body.basis.label).toBe("Monthly check");
    expect((await call(member.token, "GET", "/assessments")).body.checks).toEqual([]);
  });

  it("skips checks missed beyond the grace period instead of piling them up", async () => {
    await backdate(100);
    const p = await call(member.token, "GET", `/relationships/${relId}/progress`);
    // Cycle 2 (about 40 days ago) is past grace; cycle 3, the full assessment, is open.
    expect(p.body.current).toMatchObject({ number: 3, kind: "full" });
    expect(["late", "due_today", "upcoming"]).toContain(p.body.current.due.state);
  });

  it("builds a growth plan both people confirm", async () => {
    let s = await call(member.token, "GET", `/relationships/${relId}/plan`);
    expect(s.body).toMatchObject({ myRole: "disciple", active: null, draft: null });
    expect(s.body.suggestedFocus.length).toBeGreaterThan(0);

    const draft = {
      focusAreas: [4],
      lengthDays: 30,
      practices: [
        { title: "30 minutes of personal prayer", detail: "Before my phone", timesPerWeek: 5, area: 4 },
        { title: "Pray for three people by name", timesPerWeek: 7, area: 4 },
      ],
    };
    expect((await call(member.token, "PUT", `/relationships/${relId}/plan/draft`, { ...draft, focusAreas: [] })).status).toBe(400);
    s = await call(member.token, "PUT", `/relationships/${relId}/plan/draft`, draft);
    expect(s.body.draft).toMatchObject({ status: "draft", confirmedByMe: true, confirmedByThem: false, editedBy: "me" });
    expect(s.body.draft.practices).toHaveLength(2);

    s = await call(lead.token, "POST", `/relationships/${relId}/plan/draft/confirm`);
    expect(s.body.draft).toBeNull();
    expect(s.body.active).toMatchObject({ status: "active", startsOn: isoDay(new Date()), lengthDays: 30, ended: false });
    expect(s.body.active.endsOn).toBe(addDays(isoDay(new Date()), 29));

    // An outsider in another church sees nothing.
    expect((await call(stranger.token, "GET", `/relationships/${relId}/plan`)).status).toBe(404);
    const seen = await withTenant(otherChurchId, (tx) => tx.selectFrom("growth_plan").select("id").execute());
    expect(seen).toEqual([]);
  });

  it("only the disciple ticks practice days and writes the reflection", async () => {
    const s0 = await call(member.token, "GET", `/relationships/${relId}/plan`);
    const practiceId = s0.body.active.practices[0].id;
    const today = isoDay(new Date());
    expect((await call(lead.token, "PUT", `/practices/${practiceId}/days/${today}`, { done: true })).status).toBe(403);
    expect((await call(member.token, "PUT", `/practices/${practiceId}/days/${addDays(today, 1)}`, { done: true })).body.error.code).toBe("FUTURE_DAY");
    let s = await call(member.token, "PUT", `/practices/${practiceId}/days/${today}`, { done: true });
    expect(s.body.active.practices[0].doneThisWeek).toEqual([today]);
    s = await call(member.token, "PUT", `/practices/${practiceId}/days/${today}`, { done: false });
    expect(s.body.active.practices[0].doneThisWeek).toEqual([]);

    expect((await call(lead.token, "PUT", `/relationships/${relId}/reflection`, { did: "x" })).status).toBe(403);
    expect((await call(member.token, "PUT", `/relationships/${relId}/reflection`, {})).status).toBe(400);
    s = await call(member.token, "PUT", `/relationships/${relId}/reflection`, { did: "Prayed four mornings", needHelp: "Waking up early" });
    expect(s.body.reflections[0]).toMatchObject({ did: "Prayed four mornings", needHelp: "Waking up early" });
    // The discipler reads it.
    expect((await call(lead.token, "GET", `/relationships/${relId}/plan`)).body.reflections[0].did).toBe("Prayed four mornings");
  });

  it("a new draft replaces the active plan only once both confirm", async () => {
    const draft = { focusAreas: [4, 7], lengthDays: 60, practices: [{ title: "Serve in one church task", timesPerWeek: 1, area: 7 }] };
    let s = await call(lead.token, "PUT", `/relationships/${relId}/plan/draft`, draft);
    expect(s.body.active.focusAreas).toEqual([4]);
    expect(s.body.draft.focusAreas).toEqual([4, 7]);
    s = await call(member.token, "POST", `/relationships/${relId}/plan/draft/confirm`);
    expect(s.body.active).toMatchObject({ focusAreas: [4, 7], lengthDays: 60 });
    expect(s.body.draft).toBeNull();
  });

  it("schedules meetings and keeps a one-minute record", async () => {
    const tomorrow = new Date(Date.now() + DAY).toISOString();
    let m = await call(lead.token, "POST", `/relationships/${relId}/meetings`, { scheduledAt: tomorrow, place: "Church hall" });
    expect(m.status).toBe(201);
    expect(m.body.upcoming).toHaveLength(1);
    const future = m.body.upcoming[0].id;
    expect((await call(member.token, "POST", `/meetings/${future}/record`, { tookPlace: true })).body.error.code).toBe("NOT_YET");

    const earlier = new Date(Date.now() - 2 * 3_600_000).toISOString();
    m = await call(member.token, "POST", `/relationships/${relId}/meetings`, { scheduledAt: earlier });
    const held = [...m.body.upcoming, ...m.body.past].find((x: any) => x.scheduledAt === earlier).id;
    const nextWeek = new Date(Date.now() + 7 * DAY).toISOString();
    m = await call(lead.token, "POST", `/meetings/${held}/record`, {
      tookPlace: true,
      discussed: "Morning prayer",
      commitment: "Pray before checking my phone",
      win: "Prayed four mornings",
      nextMeetingAt: nextWeek,
    });
    expect(m.status).toBe(200);
    expect(m.body.lastCommitment).toBe("Pray before checking my phone");
    const rec = m.body.past.find((x: any) => x.id === held);
    expect(rec).toMatchObject({ status: "held", record: expect.objectContaining({ editable: true, recordedBy: "Lead Pastor" }) });
    expect(m.body.upcoming.map((x: any) => x.scheduledAt)).toContain(nextWeek);

    m = await call(member.token, "POST", `/meetings/${future}/cancel`);
    expect(m.body.past.find((x: any) => x.id === future).status).toBe("cancelled");

    expect((await call(stranger.token, "GET", `/relationships/${relId}/meetings`)).status).toBe(404);
    expect(await withTenant(otherChurchId, (tx) => tx.selectFrom("meeting").select("id").execute())).toEqual([]);

    // Records lock after 24 hours.
    await ownerDb.updateTable("meeting").set({ recorded_at: new Date(Date.now() - 25 * 3_600_000) }).where("id", "=", held).execute();
    expect((await call(lead.token, "POST", `/meetings/${held}/record`, { tookPlace: false })).body.error.code).toBe("RECORD_LOCKED");
  });
});
