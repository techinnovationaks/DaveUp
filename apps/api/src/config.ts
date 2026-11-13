// Configuration from the environment, with local-dev connection defaults.
// In production every value must come from the environment / secret store.

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
} as const;

if (isProd && config.otp.provider === "console") {
  throw new Error("OTP_PROVIDER=console is for local development only");
}
if (isProd && config.otp.provider === "none" && env.ALLOW_PHONE_ONLY_SIGNIN !== "true") {
  throw new Error("Sign-in without a code is off in production. Set TERMII_API_KEY, or ALLOW_PHONE_ONLY_SIGNIN=true to accept the risk.");
}
