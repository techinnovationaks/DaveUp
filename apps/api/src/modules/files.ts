// Sharing files and documents in a chat or cell.
//
// 1. POST /conversations/:id/files   -> an upload ticket (where to PUT the bytes)
// 2. PUT the bytes (straight to object storage, or to /files/:id/content locally)
// 3. POST /files/:id/complete        -> checks the stored size, posts the message
//
// Downloads go through GET /files/:id/download, which checks that the person
// is in the conversation before serving (or redirecting to) the file.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { FileCompleteSchema, FileUploadRequestSchema, FILE_MAX_BYTES, type FileDto, type MessageDto, type UploadTicketDto } from "@daveup/shared";
import { withTenant } from "../db/pool";
import { fileUrl, loadMessage, postMessage, requireConversationMember, requireWritable } from "../lib/chat";
import { requireMember } from "../lib/context";
import { AppError, badRequest, conflict, forbidden, notFound, parse } from "../lib/errors";
import { contentDisposition, getStorage, isInlineSafe, isS3, LocalStorage, storageKey } from "../lib/storage";

const IdParam = z.object({ id: z.string().uuid() });
const DownloadQuery = z.object({ inline: z.enum(["0", "1"]).optional() });

function requireStorage() {
  const s = getStorage();
  if (!s) throw new AppError(503, "FILES_UNAVAILABLE", "File sharing is not set up on this server yet");
  return s;
}

/** Strip path parts and control characters from a file name. */
function cleanName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  return base.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 200) || "file";
}

/** A browser-supplied type, normalised; unknown or odd values become a plain download. */
function cleanMime(mime: string): string {
  const m = mime.toLowerCase().split(";")[0]!.trim();
  return /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(m) ? m : "application/octet-stream";
}

export async function fileRoutes(app: FastifyInstance) {
  app.post("/conversations/:id/files", async (req, reply): Promise<UploadTicketDto> => {
    const ctx = await requireMember(req);
    const { id } = parse(IdParam, req.params);
    const body = parse(FileUploadRequestSchema, req.body);
    const storage = requireStorage();
    const churchId = ctx.membership.churchId;
    const out = await withTenant(churchId, async (tx) => {
      const { conv } = await requireConversationMember(tx, id, ctx.personId);
      requireWritable(conv);
      const fileId = crypto.randomUUID();
      const key = storageKey(churchId, id, fileId);
      const mime = cleanMime(body.mime);
      await tx
        .insertInto("shared_file")
        .values({ id: fileId, church_id: churchId, conversation_id: id, uploader_id: ctx.personId, name: cleanName(body.name), mime, size_bytes: body.size, storage_key: key })
        .execute();
      const target = storage.uploadTarget(fileId, key, mime);
      return { fileId, uploadUrl: target.url, headers: target.headers };
    });
    reply.code(201);
    return out;
  });

  // Local storage only: receive the bytes through the API. Registered in its
  // own scope so every content type arrives as a raw stream (a shared JSON or
  // text file must not be parsed).
  await app.register(async (raw) => {
    raw.removeAllContentTypeParsers();
    raw.addContentTypeParser("*", (_req, payload, done) => done(null, payload));
    raw.put("/files/:id/content", { bodyLimit: FILE_MAX_BYTES + 1024 }, async (req): Promise<{ ok: true }> => {
      const ctx = await requireMember(req);
      const { id } = parse(IdParam, req.params);
      const storage = requireStorage();
      if (!(storage instanceof LocalStorage)) throw notFound();
      const f = await withTenant(ctx.membership.churchId, (tx) => tx.selectFrom("shared_file").selectAll().where("id", "=", id).executeTakeFirst());
      if (!f || f.uploader_id !== ctx.personId) throw notFound();
      if (f.status !== "pending") throw conflict("ALREADY_UPLOADED", "This file is already uploaded");
      try {
        await storage.write(f.storage_key, req.body as NodeJS.ReadableStream as never, Number(f.size_bytes));
      } catch (err) {
        if (err instanceof Error && err.message === "TOO_LARGE") throw badRequest("SIZE_MISMATCH", "The file is bigger than declared");
        throw err;
      }
      return { ok: true };
    });
  });

  /** Confirm an upload: the stored file must match what was declared. Posts it in the chat. */
  app.post("/files/:id/complete", async (req, reply): Promise<MessageDto> => {
    const ctx = await requireMember(req);
    const { id } = parse(IdParam, req.params);
    const { caption } = parse(FileCompleteSchema, req.body ?? {});
    const storage = requireStorage();
    const churchId = ctx.membership.churchId;
    const f = await withTenant(churchId, (tx) => tx.selectFrom("shared_file").selectAll().where("id", "=", id).executeTakeFirst());
    if (!f || f.uploader_id !== ctx.personId) throw notFound();
    if (f.status !== "pending") throw conflict("ALREADY_UPLOADED", "This file is already shared");
    // Check outside the transaction: this is a network call to storage.
    const stored = await storage.size(f.storage_key);
    if (stored === null) throw badRequest("NOT_UPLOADED", "The upload did not finish. Please try again.");
    if (stored !== Number(f.size_bytes)) {
      await storage.remove(f.storage_key).catch(() => {});
      throw badRequest("SIZE_MISMATCH", "The uploaded file does not match. Please try again.");
    }
    const out = await withTenant(churchId, async (tx) => {
      const locked = await tx.selectFrom("shared_file").select("status").where("id", "=", id).forUpdate().executeTakeFirstOrThrow();
      if (locked.status !== "pending") throw conflict("ALREADY_UPLOADED", "This file is already shared");
      const { conv } = await requireConversationMember(tx, f.conversation_id, ctx.personId);
      requireWritable(conv);
      await tx.updateTable("shared_file").set({ status: "ready", ready_at: new Date() }).where("id", "=", id).execute();
      const m = await postMessage(tx, { churchId, conversationId: f.conversation_id, senderId: ctx.personId, kind: "file", fileId: id, body: caption || null });
      return (await loadMessage(tx, m.id))!;
    });
    reply.code(201);
    return out;
  });

  /** Files shared in a conversation, newest first. */
  app.get("/conversations/:id/files", async (req): Promise<FileDto[]> => {
    const ctx = await requireMember(req);
    const { id } = parse(IdParam, req.params);
    return withTenant(ctx.membership.churchId, async (tx) => {
      await requireConversationMember(tx, id, ctx.personId);
      const rows = await tx
        .selectFrom("shared_file as f")
        .innerJoin("person as p", "p.id", "f.uploader_id")
        .select(["f.id", "f.name", "f.mime", "f.size_bytes", "f.created_at", "p.full_name"])
        .where("f.conversation_id", "=", id)
        .where("f.status", "=", "ready")
        .orderBy("f.created_at", "desc")
        .limit(500)
        .execute();
      return rows.map((r) => ({ id: r.id, name: r.name, mime: r.mime, size: Number(r.size_bytes), uploaderName: r.full_name ?? "Member", createdAt: r.created_at.toISOString(), url: fileUrl(r.id) }));
    });
  });

  /** Open or download a file. ?inline=1 shows images, video, audio and PDFs in the browser. */
  app.get("/files/:id/download", async (req, reply) => {
    const ctx = await requireMember(req);
    const { id } = parse(IdParam, req.params);
    const { inline } = parse(DownloadQuery, req.query);
    const storage = requireStorage();
    const f = await withTenant(ctx.membership.churchId, async (tx) => {
      const row = await tx.selectFrom("shared_file").selectAll().where("id", "=", id).executeTakeFirst();
      if (!row || row.status !== "ready") throw notFound("File not found");
      await requireConversationMember(tx, row.conversation_id, ctx.personId).catch(() => {
        throw forbidden("You do not have access to this file");
      });
      return row;
    });
    const show = inline === "1" && isInlineSafe(f.mime);
    reply.header("cache-control", "private, max-age=300");
    reply.header("x-content-type-options", "nosniff");
    if (isS3(storage)) return reply.redirect(storage.downloadUrl(f.storage_key, f.name, f.mime, show), 302);
    const local = storage as LocalStorage;
    if ((await local.size(f.storage_key)) === null) throw notFound("File not found");
    reply.header("content-type", show ? f.mime : "application/octet-stream");
    reply.header("content-length", String(f.size_bytes));
    reply.header("content-disposition", contentDisposition(f.name, show));
    reply.header("content-security-policy", "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox");
    return reply.send(local.read(f.storage_key));
  });
}
