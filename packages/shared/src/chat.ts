// Chat, cells, shared files, calls and the DaveUp staff console:
// request validation and response shapes shared by the API, web and mobile.
import { z } from "zod";

// ---- Limits ----
export const MESSAGE_MAX_CHARS = 4000;
export const MESSAGES_PAGE = 50;
/** Largest file someone can share. */
export const FILE_MAX_BYTES = 50 * 1024 * 1024;
export const CELL_NAME_MAX = 80;
export const CELL_DESCRIPTION_MAX = 500;
/** A cell call can hold this many people at once. */
export const CALL_MAX_PARTICIPANTS = 100;
/** Reactions people can send during a call. */
export const CALL_REACTIONS = ["👍", "❤️", "😂", "🙏", "👏", "🎉", "🙌", "😮"] as const;
/** An unanswered direct call stops ringing after this long. */
export const CALL_RING_SECONDS = 45;

export type ConversationKind = "direct" | "cell";
export type CellRole = "leader" | "member";
export type CallMedia = "audio" | "video";
export type ChurchStatus = "unverified" | "verified" | "suspended";
export type ChurchPlan = "basic" | "standard" | "pro" | "network";

// ---- Requests ----

const Uuid = z.string().uuid();

export const CallMuteSchema = z.object({ personId: Uuid });

export const DirectChatSchema = z.object({ personId: Uuid });

export const SendMessageSchema = z.object({
  body: z.string().trim().min(1, "Write a message").max(MESSAGE_MAX_CHARS, `Messages can be up to ${MESSAGE_MAX_CHARS} characters`),
  /** Client-made id so a retried send is not posted twice. */
  clientId: z.string().uuid().optional(),
});

export const EditMessageSchema = z.object({
  body: z.string().trim().min(1, "Write a message").max(MESSAGE_MAX_CHARS),
});

export const MarkReadSchema = z.object({ seq: z.coerce.number().int().min(0) });

export const CreateCellSchema = z.object({
  name: z.string().trim().min(2, "Give the cell a name").max(CELL_NAME_MAX),
  description: z.string().trim().max(CELL_DESCRIPTION_MAX).optional().default(""),
  leaderIds: z.array(Uuid).min(1, "Choose at least one cell leader").max(10),
  memberIds: z.array(Uuid).max(500).optional().default([]),
});

export const UpdateCellSchema = z.object({
  name: z.string().trim().min(2).max(CELL_NAME_MAX).optional(),
  description: z.string().trim().max(CELL_DESCRIPTION_MAX).optional(),
});

export const AddCellMembersSchema = z.object({ personIds: z.array(Uuid).min(1).max(200) });
export const CellRoleSchema = z.object({ role: z.enum(["leader", "member"]) });

export const FileUploadRequestSchema = z.object({
  name: z.string().trim().min(1).max(200),
  mime: z.string().trim().min(1).max(200).default("application/octet-stream"),
  size: z.number().int().positive().max(FILE_MAX_BYTES, `Files can be up to ${FILE_MAX_BYTES / 1024 / 1024} MB`),
});

export const FileCompleteSchema = z.object({
  /** Optional words sent with the file. */
  caption: z.string().trim().max(MESSAGE_MAX_CHARS).optional(),
});

export const StartCallSchema = z.object({ media: z.enum(["audio", "video"]) });

// Staff
export const ChurchStatusSchema = z.object({
  status: z.enum(["unverified", "verified", "suspended"]),
  reason: z.string().trim().max(500).optional(),
});
export const ChurchPlanSchema = z.object({ plan: z.enum(["basic", "standard", "pro", "network"]) });
export const SuperAdminSchema = z.object({ personId: Uuid, grant: z.boolean() });

// ---- Responses ----

export interface ChatFeaturesDto {
  /** LiveKit is configured. */
  calls: boolean;
  /** File storage is configured. */
  files: boolean;
  fileMaxBytes: number;
}

export interface DirectoryPersonDto {
  personId: string;
  fullName: string;
  department: string | null;
  isAdmin: boolean;
}

export interface ActiveCallDto {
  id: string;
  media: CallMedia;
  startedBy: string;
  startedByName: string;
  startedAt: string;
  participantCount: number;
}

export interface ConversationSummaryDto {
  id: string;
  kind: ConversationKind;
  /** The cell name, or the other person's name. */
  title: string;
  /** Direct chats: the other person. */
  otherPersonId: string | null;
  description: string | null;
  memberCount: number;
  myRole: CellRole;
  unread: number;
  lastMessage: { preview: string; senderName: string | null; at: string } | null;
  lastMessageAt: string;
  archived: boolean;
  activeCall: ActiveCallDto | null;
}

export interface ConversationMemberDto {
  personId: string;
  fullName: string;
  role: CellRole;
  department: string | null;
}

export interface ConversationDetailDto extends ConversationSummaryDto {
  members: ConversationMemberDto[];
  /** Cells: the viewer may add and remove members (a leader or church admin). */
  canManage: boolean;
  /** The other person in a direct chat has left the church. */
  readOnly: boolean;
  /** The viewer may start a call here: anyone in a direct chat; in a cell, its leaders, disciplers and admins. */
  canStartCall: boolean;
}

export interface FileDto {
  id: string;
  name: string;
  mime: string;
  size: number;
  uploaderName: string;
  createdAt: string;
  /** Same-origin path that checks access and serves or redirects to the file. */
  url: string;
}

export interface MessageDto {
  id: string;
  seq: number;
  conversationId: string;
  kind: "text" | "file" | "call" | "system";
  senderId: string | null;
  senderName: string | null;
  body: string | null;
  file: FileDto | null;
  call: { id: string; media: CallMedia; durationSeconds: number | null; answered: boolean; ended: boolean } | null;
  createdAt: string;
  editedAt: string | null;
  deleted: boolean;
}

export interface MessagesPageDto {
  messages: MessageDto[];
  /** More, older messages exist. */
  hasMore: boolean;
}

export interface UploadTicketDto {
  fileId: string;
  /** PUT the raw bytes here. Absolute (object storage) or same-origin (/api/...). */
  uploadUrl: string;
  headers: Record<string, string>;
}

export interface CallJoinDto {
  call: ActiveCallDto & { conversationId: string };
  /** A leader in a group call: may mute other people. */
  canModerate: boolean;
  /** LiveKit server address (wss://...). */
  url: string;
  token: string;
}

export interface CellAdminDto {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
  leaders: { personId: string; fullName: string }[];
  createdAt: string;
  lastMessageAt: string;
  archived: boolean;
  /** The admin is in the cell, so can open its chat. */
  iAmMember: boolean;
}

/** Realtime events pushed over the WebSocket at /realtime. */
export type RealtimeEvent =
  | { type: "hello"; personId: string }
  | { type: "message"; conversationId: string; seq: number; senderId: string | null }
  | { type: "message.changed"; conversationId: string; messageId: string }
  | { type: "conversation"; conversationId: string }
  | { type: "read"; conversationId: string; personId: string; seq: number }
  | { type: "typing"; conversationId: string; personId: string; name: string }
  | { type: "call.ring"; callId: string; conversationId: string; media: CallMedia; fromId: string; fromName: string; title: string }
  | { type: "call.update"; callId: string; conversationId: string }
  | { type: "call.ended"; callId: string; conversationId: string };

/** What the browser may send over the WebSocket. */
export type RealtimeClientEvent = { type: "typing"; conversationId: string } | { type: "ping" };

// ---- Staff console ----

export interface StaffOverviewDto {
  churches: { total: number; unverified: number; verified: number; suspended: number };
  people: number;
  approvedMembers: number;
  pendingMembers: number;
  cells: number;
  messagesLast7Days: number;
  callsLast7Days: number;
  filesStoredBytes: number;
}

export interface StaffChurchDto {
  id: string;
  name: string;
  city: string;
  status: ChurchStatus;
  plan: ChurchPlan;
  createdAt: string;
  verifiedAt: string | null;
  members: number;
  pending: number;
  cells: number;
  admins: { personId: string; fullName: string | null; email: string | null; phone: string | null }[];
}

export interface StaffChurchDetailDto extends StaffChurchDto {
  joinCode: string;
  disciplers: number;
  activeRelationships: number;
  messagesLast30Days: number;
  recentActivity: { action: string; actorName: string | null; at: string; data: Record<string, unknown> }[];
}

export interface StaffPersonDto {
  personId: string;
  fullName: string | null;
  email: string | null;
  emailVerified: boolean;
  phone: string | null;
  createdAt: string;
  church: { id: string; name: string; status: string; isAdmin: boolean } | null;
  isSuperAdmin: boolean;
  /** Staff because SUPER_ADMIN_EMAILS names them; cannot be removed in the app. */
  superAdminFromConfig: boolean;
}

export interface StaffAuditDto {
  action: string;
  actorName: string | null;
  churchName: string | null;
  targetType: string;
  at: string;
  data: Record<string, unknown>;
}
