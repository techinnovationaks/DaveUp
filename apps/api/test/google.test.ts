// "Continue with Google", end to end through the HTTP API against the
// daveup_test database. Google itself is replaced by a stand-in that plays its
// part (account chooser, code exchange); everything else is real.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { migrate } from "../src/db/migrate";
import { buildServer } from "../src/server";
import { closeDbs, ownerDb } from "../src/db/pool";
import { setEmailSender } from "../src/lib/email";
import { idTokenClaims, setGoogle, type GoogleOAuth, type GoogleProfile } from "../src/lib/google";

let app: FastifyInstance;

// ---------- Google stand-in ----------
// The "code" Google hands back stands for the account the person chose.
const accounts = new Map<string, GoogleProfile>();
const exchanged: { code: string; codeVerifier: string; redirectUri: string }[] = [];
const google: GoogleOAuth = {
  authUrl: ({ state, codeChallenge, redirectUri }) => `https://google.test/auth?state=${state}&challenge=${codeChallenge}&redirect=${encodeURIComponent(redirectUri)}`,
  exchange: async (p) => {
    exchanged.push(p);
    const a = accounts.get(p.code);
    if (!a) throw new Error("invalid_grant");
    return a;
  },
};

const cookieOf = (res: { headers: Record<string, unknown> }, name: string): string | null => {
  const raw = res.headers["set-cookie"];
  const list = Array.isArray(raw) ? raw : raw ? [String(raw)] : [];
  const hit = list.find((c) => c.startsWith(`${name}=`));
  return hit ? hit.split(";")[0]!.slice(name.length + 1) : null;
};

/** Start the flow, "choose" an account at Google, come back. Returns the final response. */
async function continueWithGoogle(code: string, tamper?: (state: string) => string) {
  const start = await app.inject({ method: "GET", url: "/auth/google/start" });
  expect(start.statusCode).toBe(303);
  const state = new URL(start.headers.location as string).searchParams.get("state")!;
  const flow = cookieOf(start, "daveup_google")!;
  const back = tamper ? tamper(state) : state;
  return app.inject({ method: "GET", url: `/auth/google/callback?code=${code}&state=${back}`, headers: { cookie: `daveup_google=${flow}` } });
}

async function me(res: { headers: Record<string, unknown> }) {
  const token = cookieOf(res, "daveup_session")!;
  const r = await app.inject({ method: "GET", url: "/me", headers: { cookie: `daveup_session=${token}` } });
  return r.json();
}

beforeAll(async () => {
  await migrate({ reset: true });
  setEmailSender({ send: async () => {} });
  setGoogle(google);
  app = await buildServer();
  await app.ready();
});

afterAll(async () => {
  setGoogle(null);
  await app.close();
  await closeDbs();
});

describe("Continue with Google", () => {
  it("is offered when set up", async () => {
    const r = await app.inject({ method: "GET", url: "/auth/methods" });
    expect(r.json().google).toBe(true);
  });

  it("sends the browser to Google with state and PKCE", async () => {
    const start = await app.inject({ method: "GET", url: "/auth/google/start" });
    const to = new URL(start.headers.location as string);
    expect(to.searchParams.get("state")).toMatch(/^[\w-]{20,}$/);
    expect(to.searchParams.get("challenge")).toMatch(/^[\w-]{43}$/);
    expect(to.searchParams.get("redirect")).toMatch(/\/api\/auth\/google\/callback$/);
    expect(cookieOf(start, "daveup_google")).toBeTruthy();
  });

  it("signs up a new person with their Google name and verified email", async () => {
    accounts.set("ada", { sub: "g-ada", email: "ada@example.com", emailVerified: true, name: "Ada Obi" });
    const res = await continueWithGoogle("ada");
    expect(res.statusCode).toBe(303);
    expect(res.headers.location).toMatch(/\/start$/);
    const m = await me(res);
    expect(m.person.fullName).toBe("Ada Obi");
    expect(m.person.email).toBe("ada@example.com");
    expect(exchanged.at(-1)!.codeVerifier).toMatch(/^[\w-]{43}$/);
  });

  it("signs the same person in again, even after they change their DaveUp email", async () => {
    const first = await ownerDb.selectFrom("person").select("id").where("google_sub", "=", "g-ada").executeTakeFirstOrThrow();
    await ownerDb.updateTable("person").set({ email: "ada.new@example.com" }).where("id", "=", first.id).execute();
    const res = await continueWithGoogle("ada");
    expect((await me(res)).person.id).toBe(first.id);
  });

  it("links to an existing email account and keeps its name", async () => {
    const existing = await ownerDb
      .insertInto("person")
      .values({ email: "bola@example.com", email_verified_at: new Date(), full_name: "Pastor Bola" })
      .returning("id")
      .executeTakeFirstOrThrow();
    accounts.set("bola", { sub: "g-bola", email: "bola@example.com", emailVerified: true, name: "Bola G" });
    const m = await me(await continueWithGoogle("bola"));
    expect(m.person.id).toBe(existing.id);
    expect(m.person.fullName).toBe("Pastor Bola");
  });

  it("refuses an email Google has not verified", async () => {
    accounts.set("unv", { sub: "g-unv", email: "unv@example.com", emailVerified: false, name: "U" });
    const res = await continueWithGoogle("unv");
    expect(res.headers.location).toMatch(/\/signin\?google=unverified$/);
    expect(cookieOf(res, "daveup_session")).toBeNull();
  });

  it("refuses a callback whose state does not match the browser's", async () => {
    const res = await continueWithGoogle("ada", () => "someone-elses-state");
    expect(res.headers.location).toMatch(/\/signin\?google=expired$/);
    expect(cookieOf(res, "daveup_session")).toBeNull();
  });

  it("refuses a callback with no flow cookie, or a forged one", async () => {
    const none = await app.inject({ method: "GET", url: "/auth/google/callback?code=ada&state=x" });
    expect(none.headers.location).toMatch(/google=expired$/);
    const forged = Buffer.from(JSON.stringify({ state: "x", verifier: "v", exp: Date.now() + 60_000 })).toString("base64url");
    const bad = await app.inject({ method: "GET", url: "/auth/google/callback?code=ada&state=x", headers: { cookie: `daveup_google=${forged}.00` } });
    expect(bad.headers.location).toMatch(/google=expired$/);
  });

  it("explains a cancelled or failed sign-in", async () => {
    const start = await app.inject({ method: "GET", url: "/auth/google/start" });
    const cancelled = await app.inject({
      method: "GET",
      url: "/auth/google/callback?error=access_denied",
      headers: { cookie: `daveup_google=${cookieOf(start, "daveup_google")}` },
    });
    expect(cancelled.headers.location).toMatch(/google=cancelled$/);
    expect((await continueWithGoogle("no-such-code")).headers.location).toMatch(/google=failed$/);
  });
});

describe("ID token checks", () => {
  const tok = (claims: object) => `x.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;
  const good = { iss: "https://accounts.google.com", aud: "client-1", exp: Math.floor(Date.now() / 1000) + 300, sub: "1", email: "A@Example.com", email_verified: true, name: "A" };

  it("reads a valid token and lower-cases the email", () => {
    expect(idTokenClaims(tok(good), "client-1")).toEqual({ sub: "1", email: "a@example.com", emailVerified: true, name: "A" });
  });

  it("rejects another app's token, another issuer, or an expired token", () => {
    expect(() => idTokenClaims(tok(good), "client-2")).toThrow(/another app/);
    expect(() => idTokenClaims(tok({ ...good, iss: "https://evil.test" }), "client-1")).toThrow(/not from Google/);
    expect(() => idTokenClaims(tok({ ...good, exp: 1 }), "client-1")).toThrow(/expired/);
  });
});
