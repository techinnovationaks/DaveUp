// Response shapes returned by the API. Shared so web and mobile stay in sync.
import type { DisciplerStatus, MembershipStatus, Participation, RelationshipStatus } from "./domain";
import type { TestVersion } from "./questions";
import type { Comparison, Progress } from "./scoring";
import type { AreaPoint, AssessmentKind, DueState, ProgressSummary } from "./cycle";

export interface PersonDto {
  id: string;
  fullName: string | null;
  /** Null for people who signed up with email only. */
  phone: string | null;
  email: string | null;
  /** True once the person proved they own the email with a code. */
  emailVerified: boolean;
  /** Email notifications on or off (Account settings). */
  notifyEmail: boolean;
}

/** Which sign-in methods the API offers right now. */
export interface AuthMethodsDto {
  email: boolean;
  phone: boolean;
  /** Phone sign-in needs a code (SMS service configured). */
  phoneOtp: boolean;
}

export interface MembershipDto {
  id: string;
  churchId: string;
  churchName: string;
  churchCity: string;
  status: MembershipStatus;
  participation: Participation;
  department: string | null;
  isAdmin: boolean;
}

export interface MeDto {
  person: PersonDto;
  membership: MembershipDto | null;
  disciplerStatus: DisciplerStatus | null;
}

export interface ChurchLookupDto {
  id: string;
  name: string;
  city: string;
}

export interface DisciplerCardDto {
  personId: string;
  fullName: string;
  department: string | null;
  placesFilled: number;
  placesTotal: number;
}

export interface BaselineStateDto {
  disciple: "not_started" | "in_progress" | "submitted";
  discipler: "not_started" | "in_progress" | "submitted";
}

export interface RelationshipDto {
  id: string;
  status: RelationshipStatus;
  myRole: "disciple" | "discipler";
  /** Who must act next to move it forward, if anyone. */
  awaiting: "me" | "them" | "both" | null;
  /** "church": suggested by a church administrator; both people accept. */
  initiatedBy: "disciple" | "discipler" | "church";
  /** For church suggestions: whether I have accepted already. */
  iAccepted: boolean;
  other: { personId: string; fullName: string };
  baseline: BaselineStateDto;
  /** Test A id for the discipler, when started. Only returned to the discipler. */
  myAssessmentId: string | null;
  createdAt: string;
  acceptedAt: string | null;
  activatedAt: string | null;
}

export interface AssessmentSummaryDto {
  id: string;
  version: TestVersion;
  /** "check" is the 12-question monthly check; `itemIndex` says which item of each area it asks. */
  kind: AssessmentKind;
  itemIndex: number | null;
  /** Monthly cycle number; null for the baseline. */
  cycleNumber: number | null;
  subject: { personId: string; fullName: string };
  relationshipId: string | null;
  status: "in_progress" | "submitted";
  progress: Progress;
  startedAt: string;
  submittedAt: string | null;
}

export interface AssessmentDetailDto extends AssessmentSummaryDto {
  answers: { itemId: string; value: number | null; noOccasion: boolean; evidence: string | null }[];
}

export interface AssessmentHubDto {
  /** My baseline self-assessment (not a monthly check). */
  myTestB: AssessmentSummaryDto | null;
  testAsOwed: { relationshipId: string; disciple: { personId: string; fullName: string }; assessment: AssessmentSummaryDto | null }[];
  /** Monthly checks I owe: about myself, or about each disciple. */
  checks: HubCheckDto[];
}

export interface HubCheckDto {
  cycleId: string;
  relationshipId: string;
  number: number;
  kind: AssessmentKind;
  dueOn: string;
  due: DueState;
  role: "self" | "about";
  /** The person the check is about. */
  person: { personId: string; fullName: string };
  assessment: AssessmentSummaryDto | null;
}

/** One monthly cycle as seen by one of the pair. */
export interface CycleDto {
  id: string;
  number: number;
  kind: AssessmentKind;
  dueOn: string;
  due: DueState;
  completedAt: string | null;
  mine: { assessmentId: string; status: "in_progress" | "submitted"; progress: Progress } | null;
  /** The other person's state only, never their answers. */
  theirs: "not_started" | "in_progress" | "submitted";
}

export interface ProgressPointDto {
  label: string;
  kind: AssessmentKind;
  date: string;
  areas: AreaPoint[];
}

export interface RelationshipProgressDto {
  /** Open cycle, if one is due or coming up. */
  current: CycleDto | null;
  /** Baseline then each completed cycle, oldest first. */
  points: ProgressPointDto[];
  /** Words comparing the last two points (PRD 8.5). */
  summary: ProgressSummary | null;
  /** When the next check opens, if none is open. */
  nextDueOn: string | null;
}

export interface PracticeDto {
  id: string;
  title: string;
  detail: string | null;
  timesPerWeek: number;
  area: number | null;
  /** Days ticked this week (YYYY-MM-DD). */
  doneThisWeek: string[];
}

export interface GrowthPlanDto {
  id: string;
  status: "draft" | "active";
  focusAreas: number[];
  lengthDays: number;
  startsOn: string | null;
  endsOn: string | null;
  /** True once the plan's period has passed. */
  ended: boolean;
  confirmedByMe: boolean;
  confirmedByThem: boolean;
  editedBy: "me" | "them";
  practices: PracticeDto[];
}

export interface ReflectionDto {
  weekStart: string;
  did: string | null;
  difficult: string | null;
  changed: string | null;
  needHelp: string | null;
  updatedAt: string;
}

export interface PlanStateDto {
  relationshipId: string;
  myRole: "disciple" | "discipler";
  active: GrowthPlanDto | null;
  draft: GrowthPlanDto | null;
  weekStart: string;
  /** This week's reflection and the three before it, newest first. */
  reflections: ReflectionDto[];
  /** Template suggestions from the latest results: focus areas, lowest first. */
  suggestedFocus: number[];
}

export interface MeetingDto {
  id: string;
  relationshipId: string;
  scheduledAt: string;
  place: string | null;
  agenda: string | null;
  status: "scheduled" | "held" | "missed" | "cancelled";
  record: {
    tookPlace: boolean;
    discussed: string | null;
    commitment: string | null;
    prayer: string | null;
    win: string | null;
    recordedBy: string;
    recordedAt: string;
    editable: boolean;
  } | null;
}

export interface MeetingsDto {
  relationshipId: string;
  upcoming: MeetingDto[];
  past: MeetingDto[];
  /** The last agreed commitment, for the next meeting's "previous commitment" step. */
  lastCommitment: string | null;
}

export interface ComparisonDto extends Comparison {
  relationshipId: string;
  disciple: { personId: string; fullName: string };
  discipler: { personId: string; fullName: string };
  /** Template suggestion (Basic plan has no AI). Labelled as a suggestion for review. */
  suggestion: { area: number; text: string } | null;
  /** Which assessments these scores come from. */
  basis: { label: string; date: string };
}

export interface ApprovalsDto {
  members: { membershipId: string; personId: string; fullName: string | null; phone: string | null; email: string | null; participation: Participation; department: string | null; requestedAt: string }[];
  disciplerRequests: { id: string; personId: string; fullName: string | null; department: string | null; requestedAt: string }[];
}

/** Church console overview: counts only, never individual answers. */
export interface AdminOverviewDto {
  church: { id: string; name: string; city: string; status: "unverified" | "verified" | "suspended"; plan: string; joinCode: string };
  members: number;
  pendingMembers: number;
  disciplers: number;
  disciplerRequests: number;
  /** Relationships that are active or paused. */
  activeRelationships: number;
  /** Accepted, waiting for both baseline assessments. */
  baselinePending: number;
  /** Approved members with no current discipler. */
  withoutDiscipler: number;
}

/** One row of the admin members list (Church console, Members). */
export interface ChurchMemberDto {
  membershipId: string;
  personId: string;
  fullName: string | null;
  phone: string | null;
  email: string | null;
  status: MembershipStatus;
  isAdmin: boolean;
  /** Discipler status in this church, if they ever asked. */
  disciplerStatus: DisciplerStatus | null;
  participation: Participation;
  department: string | null;
  /** Their current discipler (open relationship), if any. */
  discipler: { personId: string; fullName: string | null } | null;
  /** People they currently disciple (places used, out of 12). */
  disciplesCount: number;
  joinedAt: string;
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}

/** Church console: one member, with roles, connections and the history of admin actions. */
export interface MemberDetailDto {
  member: ChurchMemberDto;
  disciplerStatusId: string | null;
  /** Places used if they are a discipler (out of 12). */
  placesFilled: number;
  relationships: {
    id: string;
    role: "disciple" | "discipler";
    other: { personId: string; fullName: string };
    status: RelationshipStatus;
    initiatedBy: "disciple" | "discipler" | "church";
    since: string;
  }[];
  history: { at: string; action: string; actor: string | null }[];
  /** True when they are the only administrator, so the role cannot be removed. */
  lastAdmin: boolean;
}

export interface SuggestResultDto {
  created: number;
  skipped: { personId: string; fullName: string | null; reason: string }[];
}
