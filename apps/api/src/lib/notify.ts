// Email notifications (PRD 12.3: meaningful, not noisy).
//
// Routes queue a notification in the same transaction as the event, so it is
// never lost and never sent for a change that rolled back. A background sender
// delivers the queue through Brevo with retries. The queue stores names and
// links only: never scores, answers, reflections or meeting notes.
import type { Kysely } from "kysely";
import { config } from "../config";
import { ownerDb } from "../db/pool";
import type { DB } from "../db/types";
import { getEmailSender, renderEmail, type EmailContent } from "./email";

type Data = {
  "member.approved": { churchName: string };
  "admin.member_waiting": { name: string };
  "admin.discipler_request": { name: string };
  "discipler.approved": Record<string, never>;
  "discipler.declined": Record<string, never>;
  "relationship.requested": { otherName: string; relationshipId: string };
  "relationship.invited": { otherName: string; relationshipId: string };
  "relationship.suggested": { otherName: string; relationshipId: string; role: "disciple" | "discipler" };
  "relationship.accepted": { otherName: string; relationshipId: string };
  "relationship.active": { otherName: string; relationshipId: string };
  "relationship.ended": { otherName: string };
  "plan.to_confirm": { otherName: string; relationshipId: string };
  "plan.active": { otherName: string; relationshipId: string };
  "meeting.scheduled": { otherName: string; relationshipId: string; at: string; place: string | null };
  "check.open": { otherName: string; relationshipId: string; full: boolean; dueOn: string };
  "cell.added": { cellName: string; conversationId: string; addedBy: string };
  "church.verified": { churchName: string };
  "church.suspended": { churchName: string };
  "church.reinstated": { churchName: string };
};
export type NotificationKind = keyof Data;

/** Queue one notification per recipient. Call inside the transaction that made the change. */
export async function notify<K extends NotificationKind>(db: Kysely<DB>, churchId: string | null, personIds: string[], kind: K, data: Data[K]): Promise<void> {
  const ids = [...new Set(personIds)];
  if (ids.length === 0) return;
  await db
    .insertInto("notification")
    .values(ids.map((person_id) => ({ person_id, church_id: churchId, kind, data: JSON.stringify(data) })))
    .execute();
}

/** Approved administrators of the church in the current tenant transaction. */
export async function churchAdminIds(db: Kysely<DB>): Promise<string[]> {
  const rows = await db.selectFrom("membership").select("person_id").where("status", "=", "approved").where("is_admin", "=", true).execute();
  return rows.map((r) => r.person_id);
}

const first = (name: string | null | undefined) => (name ?? "").trim().split(/\s+/)[0] || "there";

function when(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { timeZone: config.timeZone, weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" });
}
function day(isoDate: string) {
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("en-GB", { timeZone: config.timeZone, day: "numeric", month: "long" });
}

/** Email wording for each notification. Short, specific, one action. */
export function contentFor(kind: string, d: Record<string, any>, recipientName: string | null): EmailContent | null {
  const hi = `Hi ${first(recipientName)},`;
  const rel = (label: string) => ({ label, path: `/relationships/${d.relationshipId}` });
  switch (kind as NotificationKind) {
    case "member.approved":
      return { subject: `You're in: ${d.churchName}`, title: `Welcome to ${d.churchName}`, lines: [hi, "Your church has approved you on DaveUp. You can now choose a discipler and take the 12-area assessment."], cta: { label: "Open DaveUp", path: "/home" } };
    case "admin.member_waiting":
      return { subject: `${d.name} asked to join`, title: "A new member is waiting", lines: [hi, `${d.name} asked to join your church on DaveUp.`], cta: { label: "Review approvals", path: "/admin/approvals" } };
    case "admin.discipler_request":
      return { subject: `${d.name} asked to become a discipler`, title: "A discipler request is waiting", lines: [hi, `${d.name} asked for discipler status.`], cta: { label: "Review approvals", path: "/admin/approvals" } };
    case "discipler.approved":
      return { subject: "You are now a discipler", title: "Your discipler status is approved", lines: [hi, "Your church approved you as a discipler. Members can now choose you, and you can invite up to 12 people."], cta: { label: "Open My disciples", path: "/home" } };
    case "discipler.declined":
      return { subject: "About your discipler request", title: "Your discipler request was not approved", lines: [hi, "Your church did not approve your discipler request this time. Speak with your church administrator if you have questions."] };
    case "relationship.requested":
      return { subject: `${d.otherName} would like you to disciple them`, title: "A new discipleship request", lines: [hi, `${d.otherName} asked you to be their discipler. Take time to pray about it before you reply.`], cta: rel("Reply to the request") };
    case "relationship.invited":
      return { subject: `${d.otherName} invited you to be discipled`, title: "You have an invitation", lines: [hi, `${d.otherName} invited you to be their disciple. Nothing starts unless you accept.`], cta: rel("See the invitation") };
    case "relationship.suggested":
      return {
        subject: "Your church suggested a discipleship pairing",
        title: d.role === "disciple" ? `Your church suggested ${d.otherName} as your discipler` : `Your church suggested you disciple ${d.otherName}`,
        lines: [hi, "It only goes ahead if you both accept."],
        cta: rel("Reply to the suggestion"),
      };
    case "relationship.accepted":
      return { subject: `${d.otherName} accepted`, title: `${d.otherName} accepted`, lines: [hi, "Next, you each complete the baseline assessment on your own. You see the results together once you have both finished."], cta: rel("Open DaveUp") };
    case "relationship.active":
      return { subject: "Your results are ready", title: "Your results are ready", lines: [hi, `You and ${d.otherName} have both finished the baseline. You can now see where your views differ and agree a growth plan.`], cta: rel("See your results") };
    case "relationship.ended":
      return { subject: "A discipleship relationship has ended", title: "A relationship has ended", lines: [hi, `Your discipleship relationship with ${d.otherName} has ended. Its history is kept under your church's policy.`], cta: { label: "Open DaveUp", path: "/home" } };
    case "plan.to_confirm":
      return { subject: `${d.otherName} proposed a growth plan`, title: "A growth plan is waiting for you", lines: [hi, `${d.otherName} proposed a growth plan. It starts once you confirm it.`], cta: { label: "Review the plan", path: `/relationships/${d.relationshipId}#plan` } };
    case "plan.active":
      return { subject: "Your growth plan has started", title: "Your growth plan has started", lines: [hi, `You and ${d.otherName} have both confirmed the plan. This week's practice is ready.`], cta: { label: "See this week", path: `/relationships/${d.relationshipId}#plan` } };
    case "meeting.scheduled":
      return {
        subject: `Meeting with ${d.otherName}: ${when(d.at)}`,
        title: "A meeting is scheduled",
        lines: [hi, `${d.otherName} scheduled a meeting for ${when(d.at)}${d.place ? ` at ${d.place}` : ""}.`],
        cta: { label: "See meetings", path: `/relationships/${d.relationshipId}#meetings` },
      };
    case "check.open":
      return {
        subject: d.full ? "Your full assessment is open" : "Your monthly check is open",
        title: d.full ? "Time for the full assessment" : "Time for your monthly check",
        lines: [hi, `${d.full ? "All 60 questions, as at the baseline." : "Twelve questions, one from each area, about 4 minutes."} It is due ${day(d.dueOn)}. You and ${d.otherName} answer separately and see the change together.`],
        cta: rel("Start"),
      };
    case "cell.added":
      return {
        subject: `You were added to ${d.cellName}`,
        title: `Welcome to ${d.cellName}`,
        lines: [hi, `${d.addedBy} added you to the cell ${d.cellName} on DaveUp. You can now chat, share files and join calls with the cell.`],
        cta: { label: "Open the cell", path: `/messages/${d.conversationId}` },
      };
    case "church.verified":
      return {
        subject: `${d.churchName} is verified on DaveUp`,
        title: "Your church is verified",
        lines: [hi, `DaveUp has verified ${d.churchName}. Your church now shows as verified to members who join.`],
        cta: { label: "Open the Church console", path: "/admin" },
      };
    case "church.suspended":
      return {
        subject: `${d.churchName}'s DaveUp access is paused`,
        title: "Your church's access is paused",
        lines: [hi, `DaveUp has paused access for ${d.churchName}. Members cannot use the app until access is restored. Please reply to this email or contact DaveUp support to resolve it.`],
      };
    case "church.reinstated":
      return {
        subject: `${d.churchName}'s DaveUp access is restored`,
        title: "Your church's access is restored",
        lines: [hi, `Access for ${d.churchName} is restored. Members can use DaveUp again.`],
        cta: { label: "Open DaveUp", path: "/admin" },
      };
    default:
      return null;
  }
}

/** Minutes to wait after each failed attempt; after the last one the notification is marked failed. */
const BACKOFF_MINUTES = [1, 5, 30, 120];

/**
 * Deliver due notifications. Safe to run on several servers at once: rows are
 * claimed with SKIP LOCKED so each is sent once.
 */
export async function deliverPending(limit = 25): Promise<{ sent: number; skipped: number; failed: number }> {
  const out = { sent: 0, skipped: 0, failed: 0 };
  await ownerDb.transaction().execute(async (tx) => {
    const due = await tx
      .selectFrom("notification")
      .selectAll()
      .where("status", "=", "pending")
      .where("next_attempt_at", "<=", new Date())
      .orderBy("created_at")
      .limit(limit)
      .forUpdate()
      .skipLocked()
      .execute();
    if (due.length === 0) return;
    const people = await tx
      .selectFrom("person")
      .select(["id", "full_name", "email", "email_verified_at", "notify_email"])
      .where("id", "in", [...new Set(due.map((n) => n.person_id))])
      .execute();

    for (const n of due) {
      const p = people.find((x) => x.id === n.person_id);
      const content = contentFor(n.kind, n.data, p?.full_name ?? null);
      if (!p?.email || !p.email_verified_at || !p.notify_email || !content) {
        await tx.updateTable("notification").set({ status: "skipped" }).where("id", "=", n.id).execute();
        out.skipped += 1;
        continue;
      }
      try {
        await getEmailSender().send({ to: p.email, toName: p.full_name, ...renderEmail(content) });
        await tx.updateTable("notification").set({ status: "sent", sent_at: new Date(), attempts: n.attempts + 1, last_error: null }).where("id", "=", n.id).execute();
        out.sent += 1;
      } catch (err) {
        const attempts = n.attempts + 1;
        const wait = BACKOFF_MINUTES[attempts - 1];
        await tx
          .updateTable("notification")
          .set({
            attempts,
            last_error: String(err instanceof Error ? err.message : err).slice(0, 500),
            ...(wait === undefined ? { status: "failed" } : { next_attempt_at: new Date(Date.now() + wait * 60_000) }),
          })
          .where("id", "=", n.id)
          .execute();
        out.failed += 1;
      }
    }
  });
  return out;
}

/** Run the sender every few seconds inside the API process. Returns a stop function. */
export function startNotificationWorker(intervalMs = 5_000): () => Promise<void> {
  let running: Promise<unknown> | null = null;
  const tick = () => {
    if (running) return; // never overlap
    running = deliverPending()
      .catch((err) => console.error("[notify] delivery error:", err instanceof Error ? err.message : err))
      .finally(() => (running = null));
  };
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  return async () => {
    clearInterval(timer);
    await running;
  };
}
