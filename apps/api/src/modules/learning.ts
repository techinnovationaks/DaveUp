// Training (courses of lessons, with each person's progress) and the Resource
// Centre (documents, videos and links).
//
// Every item is DaveUp's (church_id NULL: seen by every organization, managed
// by DaveUp staff) or one organization's (seen by its approved members,
// managed by its administrators). DaveUp content has no organization, so this
// module uses the owner connection with the checks written out here.
import type { FastifyInstance, FastifyRequest } from "fastify";
import { join } from "node:path";
import { sql } from "kysely";
import { z } from "zod";
import {
  CourseSchema,
  CourseUpdateSchema,
  FILE_MAX_BYTES,
  LessonDoneSchema,
  LessonMoveSchema,
  LessonSchema,
  LibraryUploadSchema,
  ResourceSchema,
  type CourseDto,
  type CourseListDto,
  type CourseSummaryDto,
  type LibraryFileDto,
  type LibraryRightsDto,
  type LibraryScope,
  type LibraryUploadTicketDto,
  type ResourceDto,
  type ResourceListDto,
} from "@daveup/shared";
import { ownerDb } from "../db/pool";
import { currentMembership, isSuperAdmin, requireAuth } from "../lib/context";
import { AppError, badRequest, conflict, forbidden, notFound, parse } from "../lib/errors";
import { LocalStorage, contentDisposition, getStorage, isInlineSafe, isS3 } from "../lib/storage";
import { audit } from "../lib/audit";

const IdParam = z.object({ id: z.string().uuid() });
const DownloadQuery = z.object({ inline: z.enum(["0", "1"]).optional() });

interface Viewer {
  personId: string;
  /** The organization whose content they see (approved members only). */
  churchId: string | null;
  orgName: string | null;
  isAdmin: boolean;
  staff: boolean;
}

/** Members see DaveUp's and their organization's content; DaveUp staff see DaveUp's even without an organization. */
async function viewer(req: FastifyRequest): Promise<Viewer> {
  const { personId, activeChurchId } = requireAuth(req);
  const [m, staff] = await Promise.all([currentMembership(personId, activeChurchId), isSuperAdmin(personId)]);
  const member = m && m.status === "approved" && m.churchStatus !== "suspended" ? m : null;
  if (!member && !staff) throw forbidden("Join your organization first");
  const org = member ? await ownerDb.selectFrom("church").select("name").where("id", "=", member.churchId).executeTakeFirst() : null;
  return { personId, churchId: member?.churchId ?? null, orgName: org?.name ?? null, isAdmin: !!member?.isAdmin, staff };
}

const rights = (v: Viewer): LibraryRightsDto => ({ daveup: v.staff, org: v.isAdmin, orgName: v.orgName });
const canEdit = (v: Viewer, churchId: string | null) => (churchId === null ? v.staff : v.isAdmin && v.churchId === churchId);
const canSee = (v: Viewer, churchId: string | null) => churchId === null || churchId === v.churchId;
const scopeOf = (churchId: string | null): LibraryScope => (churchId === null ? "daveup" : "org");

/** The organization a new item belongs to, after checking the viewer may add there. */
function churchFor(v: Viewer, scope: LibraryScope): string | null {
  if (scope === "daveup") {
    if (!v.staff) throw forbidden("Only DaveUp staff can add content for every organization");
    return null;
  }
  if (!v.isAdmin || !v.churchId) throw forbidden("Only your organization's administrators can add content");
  return v.churchId;
}

function requireStorage() {
  const s = getStorage();
  if (!s) throw new AppError(503, "FILES_UNAVAILABLE", "File uploads are not set up on this server yet");
  return s;
}

const cleanName = (name: string) => (name.split(/[\\/]/).pop() ?? "file").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 200) || "file";
const cleanMime = (mime: string) => {
  const m = mime.toLowerCase().split(";")[0]!.trim();
  return /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(m) ? m : "application/octet-stream";
};

function fileDto(f: { id: string; name: string; mime: string; size_bytes: string | number } | null | undefined): LibraryFileDto | null {
  return f ? { id: f.id, name: f.name, mime: f.mime, size: Number(f.size_bytes), url: `/api/library/${f.id}/download` } : null;
}

/** A ready file in the same place (DaveUp or the organization) as the item it is attached to. */
async function attachable(fileId: string | null | undefined, churchId: string | null): Promise<string | null> {
  if (!fileId) return null;
  const f = await ownerDb.selectFrom("library_file").select(["church_id", "status"]).where("id", "=", fileId).executeTakeFirst();
  if (!f || f.status !== "ready" || f.church_id !== churchId) throw badRequest("FILE_NOT_READY", "That file is not uploaded yet. Please add it again.");
  return fileId;
}

// ---- Queries ----

function resourceQuery() {
  return ownerDb
    .selectFrom("resource as r")
    .leftJoin("library_file as f", "f.id", "r.file_id")
    .select(["r.id", "r.church_id", "r.title", "r.description", "r.category", "r.kind", "r.url", "r.created_at", "f.id as f_id", "f.name as f_name", "f.mime as f_mime", "f.size_bytes as f_size"]);
}

type ResourceRow = Awaited<ReturnType<ReturnType<typeof resourceQuery>["executeTakeFirstOrThrow"]>>;

function resourceDto(r: ResourceRow, v: Viewer): ResourceDto {
  return {
    id: r.id,
    scope: scopeOf(r.church_id),
    title: r.title,
    description: r.description,
    category: r.category,
    kind: r.kind,
    url: r.url,
    file: r.f_id ? fileDto({ id: r.f_id, name: r.f_name!, mime: r.f_mime!, size_bytes: r.f_size! }) : null,
    createdAt: r.created_at.toISOString(),
    canEdit: canEdit(v, r.church_id),
  };
}

async function courseSummaries(v: Viewer, onlyId?: string): Promise<CourseSummaryDto[]> {
  let q = ownerDb
    .selectFrom("course as c")
    .select([
      "c.id",
      "c.church_id",
      "c.title",
      "c.summary",
      "c.published",
      "c.updated_at",
      sql<string>`(select count(*) from lesson l where l.course_id = c.id)`.as("lessons"),
      sql<string>`(select count(*) from lesson l join lesson_progress p on p.lesson_id = l.id where l.course_id = c.id and p.person_id = ${v.personId})`.as("done"),
    ])
    .where((e) => (v.churchId ? e.or([e("c.church_id", "is", null), e("c.church_id", "=", v.churchId)]) : e("c.church_id", "is", null)))
    .orderBy("c.church_id", "desc")
    .orderBy("c.created_at", "desc");
  if (onlyId) q = q.where("c.id", "=", onlyId);
  const rows = await q.execute();
  return rows
    .filter((c) => c.published || canEdit(v, c.church_id))
    .map((c) => ({
      id: c.id,
      scope: scopeOf(c.church_id),
      title: c.title,
      summary: c.summary,
      published: c.published,
      lessonCount: Number(c.lessons),
      completedCount: Number(c.done),
      canEdit: canEdit(v, c.church_id),
      updatedAt: c.updated_at.toISOString(),
    }));
}

async function loadCourse(v: Viewer, id: string): Promise<CourseDto> {
  const [c] = await courseSummaries(v, id);
  if (!c) throw notFound("Course not found");
  const lessons = await ownerDb
    .selectFrom("lesson as l")
    .leftJoin("library_file as f", "f.id", "l.file_id")
    .leftJoin("lesson_progress as p", (j) => j.onRef("p.lesson_id", "=", "l.id").on("p.person_id", "=", v.personId))
    .select(["l.id", "l.position", "l.title", "l.body", "l.video_url", "f.id as f_id", "f.name as f_name", "f.mime as f_mime", "f.size_bytes as f_size", "p.completed_at"])
    .where("l.course_id", "=", id)
    .orderBy("l.position")
    .execute();
  return {
    ...c,
    lessons: lessons.map((l) => ({
      id: l.id,
      position: l.position,
      title: l.title,
      body: l.body,
      videoUrl: l.video_url,
      file: l.f_id ? fileDto({ id: l.f_id, name: l.f_name!, mime: l.f_mime!, size_bytes: l.f_size! }) : null,
      completed: !!l.completed_at,
    })),
  };
}

/** The course a lesson belongs to, checked for editing. */
async function editableLesson(v: Viewer, lessonId: string) {
  const l = await ownerDb
    .selectFrom("lesson as l")
    .innerJoin("course as c", "c.id", "l.course_id")
    .select(["l.id", "l.course_id", "l.position", "c.church_id"])
    .where("l.id", "=", lessonId)
    .executeTakeFirst();
  if (!l || !canSee(v, l.church_id)) throw notFound("Lesson not found");
  if (!canEdit(v, l.church_id)) throw forbidden("You cannot change this course");
  return l;
}

async function editableCourse(v: Viewer, id: string) {
  const c = await ownerDb.selectFrom("course").select(["id", "church_id", "title"]).where("id", "=", id).executeTakeFirst();
  if (!c || !canSee(v, c.church_id)) throw notFound("Course not found");
  if (!canEdit(v, c.church_id)) throw forbidden("You cannot change this course");
  return c;
}

async function touchCourse(id: string) {
  await ownerDb.updateTable("course").set({ updated_at: new Date() }).where("id", "=", id).execute();
}

export async function learningRoutes(app: FastifyInstance) {
  // ---- Files for resources and lessons ----

  app.post("/library/uploads", async (req, reply): Promise<LibraryUploadTicketDto> => {
    const v = await viewer(req);
    const body = parse(LibraryUploadSchema, req.body);
    if (body.size > FILE_MAX_BYTES) throw badRequest("TOO_LARGE", `Files can be up to ${Math.round(FILE_MAX_BYTES / 1024 / 1024)} MB`);
    const churchId = churchFor(v, body.scope);
    const storage = requireStorage();
    const id = crypto.randomUUID();
    const key = join("library", churchId ?? "daveup", id);
    const mime = cleanMime(body.mime);
    await ownerDb.insertInto("library_file").values({ id, church_id: churchId, uploader_id: v.personId, name: cleanName(body.name), mime, size_bytes: body.size, storage_key: key }).execute();
    const target = storage.uploadTarget(id, key, mime);
    reply.code(201);
    // Local storage receives the bytes through this API (see below), not the chat upload address.
    return { fileId: id, uploadUrl: storage instanceof LocalStorage ? `/api/library/${id}/content` : target.url, headers: target.headers };
  });

  // Local storage only: receive the bytes through the API, as a raw stream.
  await app.register(async (raw) => {
    raw.removeAllContentTypeParsers();
    raw.addContentTypeParser("*", (_req, payload, done) => done(null, payload));
    raw.put("/library/:id/content", { bodyLimit: FILE_MAX_BYTES + 1024 }, async (req): Promise<{ ok: true }> => {
      const { personId } = requireAuth(req);
      const { id } = parse(IdParam, req.params);
      const storage = requireStorage();
      if (!(storage instanceof LocalStorage)) throw notFound();
      const f = await ownerDb.selectFrom("library_file").selectAll().where("id", "=", id).executeTakeFirst();
      if (!f || f.uploader_id !== personId) throw notFound();
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

  app.post("/library/:id/complete", async (req): Promise<LibraryFileDto> => {
    const { personId } = requireAuth(req);
    const { id } = parse(IdParam, req.params);
    const storage = requireStorage();
    const f = await ownerDb.selectFrom("library_file").selectAll().where("id", "=", id).executeTakeFirst();
    if (!f || f.uploader_id !== personId) throw notFound();
    if (f.status === "pending") {
      const stored = await storage.size(f.storage_key);
      if (stored === null) throw badRequest("NOT_UPLOADED", "The upload did not finish. Please try again.");
      if (stored !== Number(f.size_bytes)) {
        await storage.remove(f.storage_key).catch(() => {});
        throw badRequest("SIZE_MISMATCH", "The uploaded file does not match. Please try again.");
      }
      await ownerDb.updateTable("library_file").set({ status: "ready" }).where("id", "=", id).execute();
    }
    return fileDto(f)!;
  });

  app.get("/library/:id/download", async (req, reply) => {
    const v = await viewer(req);
    const { id } = parse(IdParam, req.params);
    const { inline } = parse(DownloadQuery, req.query);
    const storage = requireStorage();
    const f = await ownerDb.selectFrom("library_file").selectAll().where("id", "=", id).executeTakeFirst();
    if (!f || f.status !== "ready" || !canSee(v, f.church_id)) throw notFound("File not found");
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

  // ---- Resource Centre ----

  app.get("/resources", async (req): Promise<ResourceListDto> => {
    const v = await viewer(req);
    const rows = await resourceQuery()
      .where((e) => (v.churchId ? e.or([e("r.church_id", "is", null), e("r.church_id", "=", v.churchId)]) : e("r.church_id", "is", null)))
      .orderBy("r.created_at", "desc")
      .execute();
    return { resources: rows.map((r) => resourceDto(r, v)), rights: rights(v) };
  });

  app.post("/resources", async (req, reply): Promise<ResourceDto> => {
    const v = await viewer(req);
    const b = parse(ResourceSchema, req.body);
    const churchId = churchFor(v, b.scope);
    const fileId = b.kind === "file" ? await attachable(b.fileId, churchId) : null;
    const { id } = await ownerDb
      .insertInto("resource")
      .values({ church_id: churchId, title: b.title, description: b.description || null, category: b.category, kind: b.kind, url: b.kind === "file" ? null : b.url!, file_id: fileId, created_by: v.personId })
      .returning("id")
      .executeTakeFirstOrThrow();
    await audit(ownerDb, { churchId, actorId: v.personId, action: "resource.added", targetType: "resource", targetId: id, data: { title: b.title } }).catch(() => {});
    reply.code(201);
    return resourceDto(await resourceQuery().where("r.id", "=", id).executeTakeFirstOrThrow(), v);
  });

  app.put("/resources/:id", async (req): Promise<ResourceDto> => {
    const v = await viewer(req);
    const { id } = parse(IdParam, req.params);
    const r = await ownerDb.selectFrom("resource").select(["church_id"]).where("id", "=", id).executeTakeFirst();
    if (!r || !canSee(v, r.church_id)) throw notFound("Resource not found");
    if (!canEdit(v, r.church_id)) throw forbidden("You cannot change this resource");
    const b = parse(ResourceSchema, { ...(req.body as object), scope: scopeOf(r.church_id) });
    const fileId = b.kind === "file" ? await attachable(b.fileId, r.church_id) : null;
    await ownerDb
      .updateTable("resource")
      .set({ title: b.title, description: b.description || null, category: b.category, kind: b.kind, url: b.kind === "file" ? null : b.url!, file_id: fileId, updated_at: new Date() })
      .where("id", "=", id)
      .execute();
    return resourceDto(await resourceQuery().where("r.id", "=", id).executeTakeFirstOrThrow(), v);
  });

  app.delete("/resources/:id", async (req) => {
    const v = await viewer(req);
    const { id } = parse(IdParam, req.params);
    const r = await ownerDb.selectFrom("resource").select(["church_id", "title"]).where("id", "=", id).executeTakeFirst();
    if (!r || !canSee(v, r.church_id)) throw notFound("Resource not found");
    if (!canEdit(v, r.church_id)) throw forbidden("You cannot remove this resource");
    await ownerDb.deleteFrom("resource").where("id", "=", id).execute();
    await audit(ownerDb, { churchId: r.church_id, actorId: v.personId, action: "resource.removed", targetType: "resource", targetId: id, data: { title: r.title } }).catch(() => {});
    return { ok: true };
  });

  // ---- Training ----

  app.get("/training", async (req): Promise<CourseListDto> => {
    const v = await viewer(req);
    return { courses: await courseSummaries(v), rights: rights(v) };
  });

  app.get("/training/:id", async (req): Promise<CourseDto> => {
    const v = await viewer(req);
    const { id } = parse(IdParam, req.params);
    return loadCourse(v, id);
  });

  app.post("/training", async (req, reply): Promise<CourseDto> => {
    const v = await viewer(req);
    const b = parse(CourseSchema, req.body);
    const churchId = churchFor(v, b.scope);
    const { id } = await ownerDb
      .insertInto("course")
      .values({ church_id: churchId, title: b.title, summary: b.summary || null, published: b.published ?? false, created_by: v.personId })
      .returning("id")
      .executeTakeFirstOrThrow();
    reply.code(201);
    return loadCourse(v, id);
  });

  app.put("/training/:id", async (req): Promise<CourseDto> => {
    const v = await viewer(req);
    const { id } = parse(IdParam, req.params);
    await editableCourse(v, id);
    const b = parse(CourseUpdateSchema, req.body);
    await ownerDb
      .updateTable("course")
      .set({
        ...(b.title !== undefined ? { title: b.title } : {}),
        ...(b.summary !== undefined ? { summary: b.summary || null } : {}),
        ...(b.published !== undefined ? { published: b.published } : {}),
        updated_at: new Date(),
      })
      .where("id", "=", id)
      .execute();
    return loadCourse(v, id);
  });

  app.delete("/training/:id", async (req) => {
    const v = await viewer(req);
    const { id } = parse(IdParam, req.params);
    const c = await editableCourse(v, id);
    await ownerDb.deleteFrom("course").where("id", "=", id).execute();
    await audit(ownerDb, { churchId: c.church_id, actorId: v.personId, action: "course.removed", targetType: "course", targetId: id, data: { title: c.title } }).catch(() => {});
    return { ok: true };
  });

  app.post("/training/:id/lessons", async (req, reply): Promise<CourseDto> => {
    const v = await viewer(req);
    const { id } = parse(IdParam, req.params);
    const c = await editableCourse(v, id);
    const b = parse(LessonSchema, req.body);
    const fileId = await attachable(b.fileId, c.church_id);
    const last = await ownerDb.selectFrom("lesson").select((e) => e.fn.max("position").as("p")).where("course_id", "=", id).executeTakeFirst();
    await ownerDb
      .insertInto("lesson")
      .values({ course_id: id, position: Number(last?.p ?? 0) + 1, title: b.title, body: b.body, video_url: b.videoUrl ?? null, file_id: fileId })
      .execute();
    await touchCourse(id);
    reply.code(201);
    return loadCourse(v, id);
  });

  app.put("/lessons/:id", async (req): Promise<CourseDto> => {
    const v = await viewer(req);
    const { id } = parse(IdParam, req.params);
    const l = await editableLesson(v, id);
    const b = parse(LessonSchema, req.body);
    const fileId = await attachable(b.fileId, l.church_id);
    await ownerDb.updateTable("lesson").set({ title: b.title, body: b.body, video_url: b.videoUrl ?? null, file_id: fileId, updated_at: new Date() }).where("id", "=", id).execute();
    await touchCourse(l.course_id);
    return loadCourse(v, l.course_id);
  });

  app.delete("/lessons/:id", async (req): Promise<CourseDto> => {
    const v = await viewer(req);
    const { id } = parse(IdParam, req.params);
    const l = await editableLesson(v, id);
    await ownerDb.deleteFrom("lesson").where("id", "=", id).execute();
    await touchCourse(l.course_id);
    return loadCourse(v, l.course_id);
  });

  /** Swap a lesson with the one before or after it. */
  app.post("/lessons/:id/move", async (req): Promise<CourseDto> => {
    const v = await viewer(req);
    const { id } = parse(IdParam, req.params);
    const { direction } = parse(LessonMoveSchema, req.body);
    const l = await editableLesson(v, id);
    await ownerDb.transaction().execute(async (tx) => {
      const other = await tx
        .selectFrom("lesson")
        .select(["id", "position"])
        .where("course_id", "=", l.course_id)
        .where("position", direction === "up" ? "<" : ">", l.position)
        .orderBy("position", direction === "up" ? "desc" : "asc")
        .limit(1)
        .executeTakeFirst();
      if (!other) return;
      await tx.updateTable("lesson").set({ position: other.position }).where("id", "=", l.id).execute();
      await tx.updateTable("lesson").set({ position: l.position }).where("id", "=", other.id).execute();
    });
    return loadCourse(v, l.course_id);
  });

  /** Mark a lesson done (or not done) for me. */
  app.put("/lessons/:id/progress", async (req): Promise<{ completed: boolean }> => {
    const v = await viewer(req);
    const { id } = parse(IdParam, req.params);
    const { done } = parse(LessonDoneSchema, req.body);
    const l = await ownerDb
      .selectFrom("lesson as l")
      .innerJoin("course as c", "c.id", "l.course_id")
      .select(["c.church_id", "c.published"])
      .where("l.id", "=", id)
      .executeTakeFirst();
    if (!l || !canSee(v, l.church_id) || (!l.published && !canEdit(v, l.church_id))) throw notFound("Lesson not found");
    if (done) await ownerDb.insertInto("lesson_progress").values({ person_id: v.personId, lesson_id: id }).onConflict((oc) => oc.doNothing()).execute();
    else await ownerDb.deleteFrom("lesson_progress").where("person_id", "=", v.personId).where("lesson_id", "=", id).execute();
    return { completed: done };
  });
}
