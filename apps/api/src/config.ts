// Configuration from the environment, with local-dev connection defaults.
// In production every value must come from the environment / secret store.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Load apps/api/.env when it exists (copy .env.example to start). Variables
// already set in the environment always win over the file. Tests never read
// it, so they always use the separate daveup_test database.
const ENV_FILE = fileURLToPath(new URL("../.env", import.meta.url));
if (process.env.NODE_ENV !== "test" && existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);

const env = process.env;
const isProd = env.NODE_ENV === "production";
const isTest = env.NODE_ENV === "test";

function required(name: string, devDefault: string): string {
  const v = env[name];
  if (v) return v;
  if (isProd) throw new Error(`Missing required env var ${name}`);
  return devDefault;
}

const dbName = isTest ? "daveup_test" : "daveup";

export const config = {
  isProd,
  isTest,
  port: Number(env.PORT ?? 4000),
  /** Owner connection: migrations, auth and church lookup. Bypasses RLS. */
  ownerDatabaseUrl: required("OWNER_DATABASE_URL", `postgres://daveup_owner:daveup_owner_dev@localhost:5433/${dbName}`),
  /** App connection: all church-scoped requests. Subject to RLS. */
  appDatabaseUrl: required("APP_DATABASE_URL", `postgres://daveup_app:daveup_app_dev@localhost:5433/${dbName}`),
  /** Secret used to hash OTP codes and session tokens. */
  authSecret: required("AUTH_SECRET", "local-dev-secret-not-for-production"),
  sessionDays: Number(env.SESSION_DAYS ?? 30),
  cookieSecure: isProd,
  otp: {
    /**
     * How sign-in codes are delivered:
     * - "termii": real SMS/WhatsApp (default when TERMII_API_KEY is set).
     * - "console": the code is written to the API server log only, never to HTTP.
     *   Local development only; refused in production.
     * - "none": no codes. People sign in with their phone number alone
     *   (default while no message service is set up). Anyone who knows a
     *   number can sign in as that person, so production refuses this unless
     *   ALLOW_PHONE_ONLY_SIGNIN=true is set on purpose.
     */
    provider: (env.OTP_PROVIDER ?? (env.TERMII_API_KEY ? "termii" : isTest ? "console" : "none")) as "termii" | "console" | "none",
    termiiApiKey: env.TERMII_API_KEY ?? "",
    termiiSenderId: env.TERMII_SENDER_ID ?? "DaveUp",
    termiiBaseUrl: env.TERMII_BASE_URL ?? "https://api.ng.termii.com",
    /** Termii channel: "dnd" (transactional SMS), "whatsapp" or "generic". */
    termiiChannel: env.TERMII_CHANNEL ?? "dnd",
  },
  email: {
    /**
     * "brevo" sends real email (default when BREVO_API_KEY is set).
     * "console" prints emails, including sign-in codes, to the API log.
     * Local development only; refused in production.
     */
    provider: (env.EMAIL_PROVIDER || (env.BREVO_API_KEY ? "brevo" : "console")) as "brevo" | "console",
    brevoApiKey: env.BREVO_API_KEY || "",
    brevoBaseUrl: env.BREVO_BASE_URL || "https://api.brevo.com",
    /** Must be a sender address verified in your Brevo account. */
    from: env.EMAIL_FROM || "no-reply@daveup.local",
    fromName: env.EMAIL_FROM_NAME || "DaveUp",
  },
  /** Public address of the web app, for links in emails. */
  appUrl: (env.APP_URL || "http://localhost:3000").replace(/\/$/, ""),
  /** Time zone used for dates and times written in emails. */
  timeZone: env.APP_TIMEZONE || "Africa/Lagos",
  /** The background sender runs inside the API process unless turned off (e.g. when a separate worker runs it). */
  notificationWorker: env.NOTIFICATION_WORKER !== "off",
} as const;

if (isProd && (config.email.provider !== "brevo" || !config.email.brevoApiKey || !env.EMAIL_FROM)) {
  throw new Error("Email sign-in needs Brevo in production: set BREVO_API_KEY and EMAIL_FROM (a verified Brevo sender)");
}
if (isProd && !env.APP_URL) throw new Error("Set APP_URL to the public web address so email links work");

if (isProd && config.otp.provider === "console") {
  throw new Error("OTP_PROVIDER=console is for local development only");
}
if (isProd && config.otp.provider === "none" && env.ALLOW_PHONE_ONLY_SIGNIN !== "true") {
  throw new Error("Sign-in without a code is off in production. Set TERMII_API_KEY, or ALLOW_PHONE_ONLY_SIGNIN=true to accept the risk.");
}
