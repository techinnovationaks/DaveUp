// Sending email: Brevo in production, the API log in local development.
// Used for sign-in codes (sent at once) and notifications (via the outbox in notify.ts).
import { config } from "../config";

export interface EmailMessage {
  to: string;
  toName?: string | null;
  subject: string;
  html: string;
  text: string;
}

export interface EmailSender {
  send(m: EmailMessage): Promise<void>;
}

/** Brevo transactional email API (https://developers.brevo.com/reference/sendtransacemail). */
class BrevoSender implements EmailSender {
  async send(m: EmailMessage): Promise<void> {
    const { brevoApiKey, brevoBaseUrl, from, fromName } = config.email;
    if (!brevoApiKey) throw new Error("BREVO_API_KEY is not set");
    const res = await fetch(`${brevoBaseUrl}/v3/smtp/email`, {
      method: "POST",
      headers: { "api-key": brevoApiKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: { name: fromName, email: from },
        to: [{ email: m.to, ...(m.toName ? { name: m.toName } : {}) }],
        subject: m.subject,
        htmlContent: m.html,
        textContent: m.text,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      // Brevo explains failures in the body (for example an unverified sender). Never log the key.
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      throw new Error(`Brevo send failed: HTTP ${res.status} ${detail}`);
    }
  }
}

/**
 * Local development only: prints the email to the API terminal so you can sign
 * in and see notifications without a Brevo account. Never returned over HTTP;
 * config.ts refuses this provider in production.
 */
class ConsoleSender implements EmailSender {
  async send(m: EmailMessage): Promise<void> {
    if (config.isTest) return;
    console.log(`[email] to ${m.to} | ${m.subject}\n${m.text}\n(console provider; set BREVO_API_KEY to send real email)`);
  }
}

let sender: EmailSender = config.email.provider === "brevo" ? new BrevoSender() : new ConsoleSender();

export function getEmailSender(): EmailSender {
  return sender;
}

/** Tests swap in a sender that captures messages. */
export function setEmailSender(s: EmailSender): void {
  sender = s;
}

// ---- One simple branded template ----

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export interface EmailContent {
  subject: string;
  /** Large heading in the email body. */
  title: string;
  /** Plain paragraphs. Escaped. */
  lines: string[];
  /** Optional big code (sign-in) shown in a box. */
  code?: string;
  /** Optional button; `path` is relative to APP_URL. */
  cta?: { label: string; path: string };
  /** Small print under the content. */
  footer?: string;
}

export function renderEmail(c: EmailContent): Pick<EmailMessage, "subject" | "html" | "text"> {
  const url = c.cta ? `${config.appUrl}${c.cta.path}` : null;
  const footer = c.footer ?? "You get this email because you use DaveUp through your church. You can turn email notifications off in Account settings.";
  const html = `<!doctype html><html><body style="margin:0;background:#F7F8FA;font-family:Inter,Segoe UI,Arial,sans-serif;color:#1E293B">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F8FA;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #E5E7EB;border-radius:16px">
<tr><td style="padding:24px 28px 0"><span style="display:inline-block;background:#D71920;color:#fff;font-weight:800;font-size:15px;padding:6px 10px;border-radius:8px">DaveUp</span></td></tr>
<tr><td style="padding:20px 28px 8px"><h1 style="margin:0 0 12px;font-size:22px;line-height:1.3">${esc(c.title)}</h1>
${c.lines.map((l) => `<p style="margin:0 0 12px;font-size:16px;line-height:1.5;color:#334155">${esc(l)}</p>`).join("\n")}
${c.code ? `<p style="margin:16px 0;font-size:32px;font-weight:800;letter-spacing:8px;text-align:center;background:#F7F8FA;border-radius:12px;padding:16px">${esc(c.code)}</p>` : ""}
${url ? `<p style="margin:20px 0 8px"><a href="${esc(url)}" style="display:inline-block;background:#D71920;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:12px 22px;border-radius:12px">${esc(c.cta!.label)}</a></p>` : ""}
</td></tr>
<tr><td style="padding:12px 28px 24px;font-size:13px;line-height:1.5;color:#64748B;border-top:1px solid #E5E7EB">${esc(footer)}</td></tr>
</table></td></tr></table></body></html>`;
  const text = [c.title, "", ...c.lines, ...(c.code ? ["", c.code] : []), ...(url ? ["", `${c.cta!.label}: ${url}`] : []), "", footer].join("\n");
  return { subject: c.subject, html, text };
}
