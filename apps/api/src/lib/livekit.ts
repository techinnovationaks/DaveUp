// LiveKit: hosts the audio and video for calls. The API decides who may join
// which room and signs short-lived access tokens; browsers then connect to
// LiveKit directly. No LiveKit SDK is needed on the server: a token is a JWT
// signed with the API secret, and the room service is plain HTTP (Twirp).
import { createHmac } from "node:crypto";
import { config } from "../config";

export function livekitEnabled(): boolean {
  const l = config.livekit;
  return !!(l.url && l.apiKey && l.apiSecret);
}

const b64url = (v: string | Buffer) => Buffer.from(v).toString("base64url");

interface VideoGrant {
  room?: string;
  roomJoin?: boolean;
  roomAdmin?: boolean;
  roomList?: boolean;
  roomCreate?: boolean;
  canPublish?: boolean;
  canSubscribe?: boolean;
  canPublishData?: boolean;
}

export function signToken(opts: { identity?: string; name?: string; grant: VideoGrant; ttlSeconds: number; metadata?: string }): string {
  const { apiKey, apiSecret } = config.livekit;
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const payload: Record<string, unknown> = { iss: apiKey, nbf: now - 10, exp: now + opts.ttlSeconds, video: opts.grant };
  if (opts.identity) {
    payload.sub = opts.identity;
    payload.jti = opts.identity;
  }
  if (opts.name) payload.name = opts.name;
  if (opts.metadata) payload.metadata = opts.metadata;
  const body = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const sig = createHmac("sha256", apiSecret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

/** Token for one person to join one room for one call (valid long enough to connect and stay). */
export function joinToken(room: string, personId: string, name: string, ttlSeconds = 6 * 3600): string {
  return signToken({
    identity: personId,
    name,
    ttlSeconds,
    grant: { room, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true },
  });
}

/** https:// form of LIVEKIT_URL for server API calls. */
function httpBase(): string {
  return config.livekit.url.replace(/^ws(s?):\/\//, "http$1://").replace(/\/+$/, "");
}

async function roomService<T>(method: string, body: Record<string, unknown>, grant: VideoGrant): Promise<T | null> {
  const token = signToken({ grant, ttlSeconds: 60 });
  const res = await fetch(`${httpBase()}/twirp/livekit.RoomService/${method}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8_000),
  });
  if (res.status === 404) return null; // no such room (nobody has joined, or it closed)
  if (!res.ok) throw new Error(`LiveKit ${method} failed: HTTP ${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`);
  return (await res.json()) as T;
}

/** People connected to a room right now (their identities are person ids). */
export async function roomParticipants(room: string): Promise<string[]> {
  const r = await roomService<{ participants?: { identity: string }[] }>("ListParticipants", { room }, { room, roomAdmin: true });
  return (r?.participants ?? []).map((p) => p.identity);
}

/** Close a room and disconnect everyone in it. */
export async function closeRoom(room: string): Promise<void> {
  await roomService("DeleteRoom", { room }, { room, roomCreate: true });
}
