import { config } from "../config";

export interface OtpSender {
  send(phoneE164: string, code: string): Promise<void>;
}

/** Termii (https://developers.termii.com) — SMS / WhatsApp delivery for Nigeria. */
class TermiiSender implements OtpSender {
  async send(phoneE164: string, code: string): Promise<void> {
    const { termiiApiKey, termiiSenderId, termiiBaseUrl, termiiChannel } = config.otp;
    if (!termiiApiKey) throw new Error("TERMII_API_KEY is not set");
    const res = await fetch(`${termiiBaseUrl}/api/sms/send`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: termiiApiKey,
        to: phoneE164.replace(/^\+/, ""),
        from: termiiSenderId,
        sms: `Your DaveUp code is ${code}. It expires in 5 minutes. Do not share it with anyone.`,
        type: "plain",
        channel: termiiChannel,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      throw new Error(`Termii send failed: HTTP ${res.status}`);
    }
  }
}

/**
 * Local development only: prints the code to the API server's terminal so a
 * developer can sign in without an SMS account. The code is never returned
 * over HTTP. config.ts refuses this provider in production.
 */
class ConsoleSender implements OtpSender {
  async send(phoneE164: string, code: string): Promise<void> {
    if (config.isTest) return;
    console.log(`[otp] ${phoneE164} -> ${code}  (console provider; set TERMII_API_KEY to send real SMS)`);
  }
}

let sender: OtpSender | null = config.otp.provider === "termii" ? new TermiiSender() : config.otp.provider === "console" ? new ConsoleSender() : null;

/** Null when codes are switched off (no message service): sign-in is by phone number alone. */
export function getOtpSender(): OtpSender | null {
  return sender;
}

/** Tests swap in a sender that captures codes, or null to switch codes off. */
export function setOtpSender(s: OtpSender | null): void {
  sender = s;
}
