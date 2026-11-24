// Sign in with Google: the OpenID Connect authorisation-code flow with PKCE.
// https://developers.google.com/identity/openid-connect/openid-connect
import { createHash, randomBytes } from "node:crypto";
import { config } from "../config";

export interface GoogleProfile {
  /** Google's stable id for the account. */
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
}

export interface GoogleOAuth {
  authUrl(p: { state: string; codeChallenge: string; redirectUri: string }): string;
  /** Swap the one-time code for the signed-in person's profile. */
  exchange(p: { code: string; codeVerifier: string; redirectUri: string }): Promise<GoogleProfile>;
}

export class GoogleError extends Error {}

const ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);

/** Read the claims of an ID token received straight from Google's token endpoint. */
export function idTokenClaims(idToken: string, clientId: string, now = Date.now()): GoogleProfile {
  const part = idToken.split(".")[1];
  if (!part) throw new GoogleError("Google sent no ID token");
  let c: Record<string, unknown>;
  try {
    c = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
  } catch {
    throw new GoogleError("Google sent an unreadable ID token");
  }
  // The token came over TLS directly from Google's token endpoint, which
  // OpenID Connect accepts in place of checking the signature (Core 3.1.3.7).
  // The audience, issuer and expiry are still checked.
  if (!ISSUERS.has(String(c.iss))) throw new GoogleError("ID token is not from Google");
  const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
  if (!aud.includes(clientId)) throw new GoogleError("ID token is for another app");
  if (typeof c.exp !== "number" || c.exp * 1000 < now - 60_000) throw new GoogleError("ID token has expired");
  if (typeof c.sub !== "string" || !c.sub || typeof c.email !== "string" || !c.email) throw new GoogleError("Google did not share an email address");
  return {
    sub: c.sub,
    email: c.email.trim().toLowerCase(),
    emailVerified: c.email_verified === true || c.email_verified === "true",
    name: typeof c.name === "string" && c.name.trim() ? c.name.trim().slice(0, 120) : null,
  };
}

class GoogleApi implements GoogleOAuth {
  constructor(
    private clientId: string,
    private clientSecret: string,
  ) {}

  authUrl({ state, codeChallenge, redirectUri }: { state: string; codeChallenge: string; redirectUri: string }): string {
    const q = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      prompt: "select_account",
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
  }

  async exchange({ code, codeVerifier, redirectUri }: { code: string; codeVerifier: string; redirectUri: string }): Promise<GoogleProfile> {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
        code_verifier: codeVerifier,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json().catch(() => ({}))) as { id_token?: string; error?: string; error_description?: string };
    if (!res.ok || !body.id_token) throw new GoogleError(`Google token exchange failed: ${body.error_description || body.error || res.status}`);
    return idTokenClaims(body.id_token, this.clientId);
  }
}

let instance: GoogleOAuth | null | undefined;

/** null when Google sign-in is not set up. */
export function getGoogle(): GoogleOAuth | null {
  if (instance === undefined) {
    instance = config.google.clientId && config.google.clientSecret ? new GoogleApi(config.google.clientId, config.google.clientSecret) : null;
  }
  return instance;
}

/** Tests: replace Google with a stand-in (or null to switch it off). */
export function setGoogle(g: GoogleOAuth | null): void {
  instance = g;
}

export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}
