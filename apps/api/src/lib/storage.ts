// Where shared files live.
//
// - S3-compatible object storage (Cloudflare R2, AWS S3, Backblaze B2): the
//   browser uploads straight to the bucket with a short-lived signed URL, and
//   downloads are redirects to a signed URL. The API never holds file bytes.
// - Local folder: development only. Uploads and downloads go through the API.
//
// Object keys are made from ids only (church/conversation/file), never from
// names people typed.
import { createHash, createHmac } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { config } from "../config";

/** Signed links stay valid this long. */
const UPLOAD_TTL_SECONDS = 15 * 60;
const DOWNLOAD_TTL_SECONDS = 5 * 60;

/** Types a browser may show inline. Anything else (HTML, SVG, scripts) is always downloaded. */
const INLINE_SAFE = /^(image\/(png|jpe?g|gif|webp|avif|heic|heif)|video\/(mp4|webm|quicktime)|audio\/(mpeg|mp4|aac|ogg|wav|webm|x-m4a)|application\/pdf)$/i;

export function isInlineSafe(mime: string): boolean {
  return INLINE_SAFE.test(mime);
}

/** Content-Disposition with a safe ASCII fallback and the real name in UTF-8. */
export function contentDisposition(name: string, inline: boolean): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export interface Storage {
  readonly kind: "s3" | "local";
  /** Where the browser PUTs the bytes. */
  uploadTarget(fileId: string, key: string, mime: string): { url: string; headers: Record<string, string> };
  /** Stored size in bytes, or null if nothing is stored there. */
  size(key: string): Promise<number | null>;
  remove(key: string): Promise<void>;
}

// ---------- S3 (AWS Signature Version 4, query-string signing) ----------

const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const hmacRaw = (key: Buffer | string, s: string) => createHmac("sha256", key).update(s, "utf8").digest();
/** RFC 3986 encoding, as SigV4 requires. */
const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());

export interface S3Options {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Bucket in the host name (bucket.s3.amazonaws.com) instead of the path. */
  virtualHosted?: boolean;
}

/**
 * Presign a request to an S3-compatible service. Exported for tests against
 * the AWS documentation example.
 */
export function presignS3(
  o: S3Options,
  method: "GET" | "PUT" | "HEAD" | "DELETE",
  key: string,
  expiresSeconds: number,
  extraQuery: Record<string, string> = {},
  now = new Date(),
): string {
  const base = new URL(o.endpoint);
  const host = o.virtualHosted ? `${o.bucket}.${base.host}` : base.host;
  const encodedKey = key.split("/").map(enc).join("/");
  const path = o.virtualHosted ? `/${encodedKey}` : `/${enc(o.bucket)}/${encodedKey}`;
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const day = amzDate.slice(0, 8);
  const scope = `${day}/${o.region}/s3/aws4_request`;
  const query: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${o.accessKeyId}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expiresSeconds),
    "X-Amz-SignedHeaders": "host",
    ...extraQuery,
  };
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((k) => `${enc(k)}=${enc(query[k]!)}`)
    .join("&");
  const canonicalRequest = [method, path, canonicalQuery, `host:${host}`, "", "host", "UNSIGNED-PAYLOAD"].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonicalRequest)].join("\n");
  const kDate = hmacRaw("AWS4" + o.secretAccessKey, day);
  const kRegion = hmacRaw(kDate, o.region);
  const kService = hmacRaw(kRegion, "s3");
  const kSigning = hmacRaw(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign, "utf8").digest("hex");
  return `${base.protocol}//${host}${path}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

class S3Storage implements Storage {
  readonly kind = "s3" as const;
  constructor(private o: S3Options) {}

  uploadTarget(_fileId: string, key: string, mime: string) {
    return { url: presignS3(this.o, "PUT", key, UPLOAD_TTL_SECONDS), headers: { "content-type": mime } };
  }

  downloadUrl(key: string, name: string, mime: string, inline: boolean): string {
    const show = inline && isInlineSafe(mime);
    return presignS3(this.o, "GET", key, DOWNLOAD_TTL_SECONDS, {
      "response-content-disposition": contentDisposition(name, show),
      "response-content-type": show ? mime : "application/octet-stream",
    });
  }

  async size(key: string): Promise<number | null> {
    const res = await fetch(presignS3(this.o, "HEAD", key, 60), { method: "HEAD", signal: AbortSignal.timeout(10_000) });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Storage HEAD failed: HTTP ${res.status}`);
    return Number(res.headers.get("content-length") ?? 0);
  }

  async remove(key: string): Promise<void> {
    const res = await fetch(presignS3(this.o, "DELETE", key, 60), { method: "DELETE", signal: AbortSignal.timeout(10_000) });
    if (!res.ok && res.status !== 404) throw new Error(`Storage DELETE failed: HTTP ${res.status}`);
  }
}

// ---------- Local folder (development) ----------

export class LocalStorage implements Storage {
  readonly kind = "local" as const;
  constructor(private dir: string) {}

  private pathFor(key: string): string {
    const root = resolve(this.dir);
    const p = resolve(root, key);
    if (!p.startsWith(root + "/")) throw new Error("Bad storage key");
    return p;
  }

  uploadTarget(fileId: string, _key: string, mime: string) {
    return { url: `/api/files/${fileId}/content`, headers: { "content-type": mime } };
  }

  /** Write an upload, refusing anything bigger than maxBytes. */
  async write(key: string, body: Readable, maxBytes: number): Promise<number> {
    const p = this.pathFor(key);
    await mkdir(dirname(p), { recursive: true });
    let n = 0;
    try {
      await pipeline(
        body,
        async function* (source) {
          for await (const chunk of source) {
            n += (chunk as Buffer).length;
            if (n > maxBytes) throw new Error("TOO_LARGE");
            yield chunk;
          }
        },
        createWriteStream(p),
      );
    } catch (err) {
      await rm(p, { force: true });
      throw err;
    }
    return n;
  }

  read(key: string): Readable {
    return createReadStream(this.pathFor(key));
  }

  async size(key: string): Promise<number | null> {
    try {
      return (await stat(this.pathFor(key))).size;
    } catch {
      return null;
    }
  }

  async remove(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }
}

let storage: Storage | null =
  config.storage.provider === "s3"
    ? new S3Storage(config.storage.s3)
    : config.storage.provider === "local"
      ? new LocalStorage(config.storage.localDir)
      : null;

/** Null when no file storage is configured (files are then turned off). */
export function getStorage(): Storage | null {
  return storage;
}

/** Tests point storage at a temporary folder. */
export function setStorage(s: Storage | null): void {
  storage = s;
}

export function storageKey(churchId: string, conversationId: string, fileId: string): string {
  return join(churchId, conversationId, fileId);
}

export function isS3(s: Storage): s is S3Storage {
  return s.kind === "s3";
}
