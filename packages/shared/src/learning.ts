// Training (courses of lessons) and the Resource Centre (documents, videos
// and links). Content is DaveUp's (every organization sees it) or one
// organization's own.
import { z } from "zod";

export type LibraryScope = "daveup" | "org";
export type ResourceKind = "file" | "link" | "video";

export const RESOURCE_CATEGORIES = ["Bible study", "Discipleship", "Prayer", "Leadership", "Devotionals", "Sermons", "Forms and guides", "General"] as const;

const Url = z
  .string()
  .trim()
  .max(1000)
  .url("Enter a full web address, starting with https://")
  .refine((u) => /^https?:\/\//i.test(u), "Enter a web address starting with https://");

export const LibraryUploadSchema = z.object({
  name: z.string().trim().min(1).max(200),
  mime: z.string().trim().max(200),
  size: z.number().int().positive(),
  scope: z.enum(["daveup", "org"]),
});

export const ResourceSchema = z
  .object({
    title: z.string().trim().min(1, "Give it a title").max(160),
    description: z.string().trim().max(2000).optional().nullable(),
    category: z.string().trim().min(1).max(60).default("General"),
    kind: z.enum(["file", "link", "video"]),
    url: Url.optional().nullable(),
    fileId: z.string().uuid().optional().nullable(),
    scope: z.enum(["daveup", "org"]),
  })
  .refine((r) => (r.kind === "file" ? !!r.fileId : !!r.url), { message: "Add the file or the web address", path: ["url"] });

export const CourseSchema = z.object({
  title: z.string().trim().min(1, "Give the course a title").max(160),
  summary: z.string().trim().max(2000).optional().nullable(),
  published: z.boolean().optional(),
  scope: z.enum(["daveup", "org"]),
});

export const CourseUpdateSchema = CourseSchema.omit({ scope: true }).partial();

export const LessonSchema = z.object({
  title: z.string().trim().min(1, "Give the lesson a title").max(160),
  body: z.string().max(50000).default(""),
  videoUrl: Url.optional().nullable().or(z.literal("").transform(() => null)),
  fileId: z.string().uuid().optional().nullable(),
});

export const LessonMoveSchema = z.object({ direction: z.enum(["up", "down"]) });
export const LessonDoneSchema = z.object({ done: z.boolean() });

export interface LibraryFileDto {
  id: string;
  name: string;
  mime: string;
  size: number;
  url: string;
}

export interface LibraryUploadTicketDto {
  fileId: string;
  uploadUrl: string;
  headers: Record<string, string>;
}

/** What the viewer may add: DaveUp-wide content (staff) and their organization's own (admins). */
export interface LibraryRightsDto {
  daveup: boolean;
  org: boolean;
  orgName: string | null;
}

export interface ResourceDto {
  id: string;
  scope: LibraryScope;
  title: string;
  description: string | null;
  category: string;
  kind: ResourceKind;
  url: string | null;
  file: LibraryFileDto | null;
  createdAt: string;
  canEdit: boolean;
}

export interface ResourceListDto {
  resources: ResourceDto[];
  rights: LibraryRightsDto;
}

export interface CourseSummaryDto {
  id: string;
  scope: LibraryScope;
  title: string;
  summary: string | null;
  published: boolean;
  lessonCount: number;
  completedCount: number;
  canEdit: boolean;
  updatedAt: string;
}

export interface CourseListDto {
  courses: CourseSummaryDto[];
  rights: LibraryRightsDto;
}

export interface LessonDto {
  id: string;
  position: number;
  title: string;
  body: string;
  videoUrl: string | null;
  file: LibraryFileDto | null;
  completed: boolean;
}

export interface CourseDto extends CourseSummaryDto {
  lessons: LessonDto[];
}

/** A YouTube or Vimeo address as an embeddable player address, or null for any other site. */
export function embedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\.|^m\./, "");
    if (host === "youtu.be") return `https://www.youtube-nocookie.com/embed/${u.pathname.slice(1)}`;
    if (host === "youtube.com") {
      const v = u.searchParams.get("v") ?? (u.pathname.startsWith("/shorts/") || u.pathname.startsWith("/embed/") ? u.pathname.split("/")[2] : null);
      return v ? `https://www.youtube-nocookie.com/embed/${v}` : null;
    }
    if (host === "vimeo.com" && /^\/\d+/.test(u.pathname)) return `https://player.vimeo.com/video/${u.pathname.split("/")[1]}`;
    return null;
  } catch {
    return null;
  }
}
