import { z } from "zod";

// ---- Rules from the PRD (section 6) ----
export const MAX_ACTIVE_DISCIPLES = 12; // 6.4: the discipler is additional to the 12
export const TEST_B_REUSE_DAYS = 30; // 6.7 rule 10 (church-configurable later)
export const OTP_TTL_SECONDS = 300;
export const OTP_MAX_ATTEMPTS = 5;

export const PARTICIPATION = ["grow", "disciple", "both"] as const;
export type Participation = (typeof PARTICIPATION)[number];

export const MEMBERSHIP_STATUS = ["pending", "approved", "rejected", "left"] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUS)[number];

export const DISCIPLER_STATUS = ["requested", "approved", "rejected", "suspended", "revoked"] as const;
export type DisciplerStatus = (typeof DISCIPLER_STATUS)[number];

/** PRD 6.7 relationship statuses. */
export const RELATIONSHIP_STATUS = ["requested", "accepted_baseline_pending", "active", "paused", "ended", "declined"] as const;
export type RelationshipStatus = (typeof RELATIONSHIP_STATUS)[number];

/** Statuses that hold one of the discipler's 12 places (PRD 6.4). */
export const CAPACITY_STATUSES: RelationshipStatus[] = ["accepted_baseline_pending", "active", "paused"];

export const END_REASONS = ["completed_season", "moved", "inactive", "concern", "other"] as const;
export type EndReason = (typeof END_REASONS)[number];

// ---- Request schemas shared by API and clients ----

/** Nigerian numbers: accept 0803..., +234803..., 234803...; normalise to E.164. */
export function normalisePhone(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, "");
  let d = digits.startsWith("+") ? digits.slice(1) : digits;
  if (d.startsWith("0")) {
    // Local Nigerian format must be exactly 11 digits, e.g. 0803 000 0000.
    if (d.length !== 11) return null;
    d = "234" + d.slice(1);
  }
  // E.164 country codes never start with 0.
  if (!/^[1-9]\d{9,14}$/.test(d)) return null;
  return "+" + d;
}

export const PhoneSchema = z.string().transform((v, ctx) => {
  const p = normalisePhone(v);
  if (!p) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Enter a valid phone number" });
    return z.NEVER;
  }
  return p;
});

export const OtpRequestSchema = z.object({ phone: PhoneSchema });
export const OtpVerifySchema = z.object({ phone: PhoneSchema, code: z.string().regex(/^\d{6}$/) });

export const ProfileUpdateSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  email: z.string().trim().email().max(200).optional().or(z.literal("")),
});

export const RegisterChurchSchema = z.object({
  name: z.string().trim().min(3).max(120),
  city: z.string().trim().min(2).max(80),
  participation: z.enum(PARTICIPATION),
  department: z.string().trim().max(80).optional(),
});

export const JoinChurchSchema = z.object({
  code: z.string().trim().toUpperCase().min(4).max(16),
  participation: z.enum(PARTICIPATION),
  department: z.string().trim().max(80).optional(),
});

export const CreateRelationshipSchema = z.union([
  z.object({ disciplerId: z.string().uuid(), disclosureConfirmed: z.literal(true) }),
  z.object({ discipleId: z.string().uuid() }),
]);

export const AcceptRelationshipSchema = z.object({ disclosureConfirmed: z.boolean().optional() });

export const EndRelationshipSchema = z.object({ reason: z.enum(END_REASONS), note: z.string().max(500).optional() });

export const StartAssessmentSchema = z.union([
  z.object({ version: z.literal("B") }),
  z.object({ version: z.literal("A"), relationshipId: z.string().uuid() }),
]);

export const AnswerSchema = z
  .object({
    value: z.number().int().min(0).max(4).nullable(),
    noOccasion: z.boolean().default(false),
    evidence: z.string().trim().max(1000).optional(),
  })
  .refine((a) => a.noOccasion || a.value !== null, { message: "Choose an answer or No occasion yet" });

export const DecisionSchema = z.object({ note: z.string().max(500).optional() });
