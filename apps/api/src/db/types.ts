// Kysely table types. Keep in sync with src/db/migrations.
import type { ColumnType, Generated } from "kysely";

type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;
type NullableTimestamp = ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;

export interface PersonTable {
  id: Generated<string>;
  phone: string | null;
  full_name: string | null;
  email: string | null;
  email_verified_at: NullableTimestamp;
  notify_email: Generated<boolean>;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface OtpChallengeTable {
  id: Generated<string>;
  phone: string | null;
  email: string | null;
  purpose: Generated<"signin" | "change_email">;
  person_id: string | null;
  code_hash: string;
  expires_at: Timestamp;
  attempts: Generated<number>;
  consumed_at: NullableTimestamp;
  created_at: Timestamp;
}

export interface SessionTable {
  id: Generated<string>;
  person_id: string;
  token_hash: string;
  created_at: Timestamp;
  expires_at: Timestamp;
  revoked_at: NullableTimestamp;
}

export interface ChurchTable {
  id: Generated<string>;
  name: string;
  city: string;
  join_code: string;
  plan: Generated<"basic" | "standard" | "pro" | "network">;
  status: Generated<"unverified" | "verified" | "suspended">;
  verified_at: NullableTimestamp;
  created_by: string;
  settings: Generated<Record<string, unknown>>;
  created_at: Timestamp;
}

export interface MembershipTable {
  id: Generated<string>;
  church_id: string;
  person_id: string;
  status: "pending" | "approved" | "rejected" | "left";
  participation: "grow" | "disciple" | "both";
  department: string | null;
  is_admin: Generated<boolean>;
  created_at: Timestamp;
  decided_at: NullableTimestamp;
  decided_by: string | null;
}

export interface DisciplerStatusTable {
  id: Generated<string>;
  church_id: string;
  person_id: string;
  status: "requested" | "approved" | "rejected" | "suspended" | "revoked";
  note: string | null;
  requested_at: Timestamp;
  decided_at: NullableTimestamp;
  decided_by: string | null;
}

export interface RelationshipTable {
  id: Generated<string>;
  church_id: string;
  discipler_id: string;
  disciple_id: string;
  status: "requested" | "accepted_baseline_pending" | "active" | "paused" | "ended" | "declined";
  initiated_by: "disciple" | "discipler" | "church";
  proposed_by: string | null;
  discipler_accepted_at: NullableTimestamp;
  disciple_accepted_at: NullableTimestamp;
  disclosure_confirmed_at: NullableTimestamp;
  baseline_a_id: string | null;
  baseline_b_id: string | null;
  created_at: Timestamp;
  accepted_at: NullableTimestamp;
  activated_at: NullableTimestamp;
  ended_at: NullableTimestamp;
  end_reason: string | null;
}

export interface AssessmentTable {
  id: Generated<string>;
  church_id: string;
  version: "A" | "B";
  respondent_id: string;
  subject_id: string;
  relationship_id: string | null;
  status: Generated<"in_progress" | "submitted">;
  started_at: Timestamp;
  submitted_at: NullableTimestamp;
  kind: Generated<"full" | "check">;
  item_index: number | null;
  cycle_id: string | null;
}

/** DATE columns come back as "YYYY-MM-DD" (see pool.ts). */
type DateString = string;

export interface AssessmentCycleTable {
  id: Generated<string>;
  church_id: string;
  relationship_id: string;
  number: number;
  kind: "full" | "check";
  item_index: number | null;
  due_on: DateString;
  test_a_id: string | null;
  test_b_id: string | null;
  created_at: Timestamp;
  completed_at: NullableTimestamp;
}

export interface GrowthPlanTable {
  id: Generated<string>;
  church_id: string;
  relationship_id: string;
  status: "draft" | "active" | "replaced" | "discarded";
  focus_areas: number[];
  length_days: number;
  starts_on: DateString | null;
  ends_on: DateString | null;
  edited_by: string;
  confirmed_by_disciple_at: NullableTimestamp;
  confirmed_by_discipler_at: NullableTimestamp;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface PlanPracticeTable {
  id: Generated<string>;
  church_id: string;
  plan_id: string;
  position: number;
  title: string;
  detail: string | null;
  times_per_week: number;
  area: number | null;
}

export interface PracticeLogTable {
  practice_id: string;
  church_id: string;
  day: DateString;
  done_at: Timestamp;
}

export interface ReflectionTable {
  id: Generated<string>;
  church_id: string;
  relationship_id: string;
  week_start: DateString;
  did: string | null;
  difficult: string | null;
  changed: string | null;
  need_help: string | null;
  author_id: string;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface MeetingTable {
  id: Generated<string>;
  church_id: string;
  relationship_id: string;
  scheduled_at: Timestamp;
  place: string | null;
  agenda: string | null;
  status: Generated<"scheduled" | "held" | "missed" | "cancelled">;
  created_by: string;
  created_at: Timestamp;
  took_place: boolean | null;
  discussed: string | null;
  commitment: string | null;
  prayer: string | null;
  win: string | null;
  recorded_by: string | null;
  recorded_at: NullableTimestamp;
}

export interface AssessmentAnswerTable {
  assessment_id: string;
  church_id: string;
  item_id: string;
  value: number | null;
  no_occasion: boolean;
  evidence: string | null;
  updated_at: Timestamp;
}

export interface AuditLogTable {
  id: Generated<string>;
  church_id: string;
  actor_id: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  data: ColumnType<Record<string, unknown>, string | undefined, string>;
  created_at: Timestamp;
}

export interface NotificationTable {
  id: Generated<string>;
  person_id: string;
  church_id: string | null;
  kind: string;
  data: ColumnType<Record<string, unknown>, string | undefined, string>;
  status: Generated<"pending" | "sent" | "skipped" | "failed">;
  attempts: Generated<number>;
  next_attempt_at: Timestamp;
  last_error: string | null;
  created_at: Timestamp;
  sent_at: NullableTimestamp;
}

export interface DB {
  person: PersonTable;
  otp_challenge: OtpChallengeTable;
  session: SessionTable;
  church: ChurchTable;
  membership: MembershipTable;
  discipler_status: DisciplerStatusTable;
  relationship: RelationshipTable;
  assessment: AssessmentTable;
  assessment_answer: AssessmentAnswerTable;
  audit_log: AuditLogTable;
  assessment_cycle: AssessmentCycleTable;
  growth_plan: GrowthPlanTable;
  plan_practice: PlanPracticeTable;
  practice_log: PracticeLogTable;
  reflection: ReflectionTable;
  meeting: MeetingTable;
  notification: NotificationTable;
}
