import type { ZodTypeAny, output } from "zod";

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const badRequest = (code: string, message: string) => new AppError(400, code, message);
export const unauthorized = (message = "Sign in to continue") => new AppError(401, "UNAUTHENTICATED", message);
export const forbidden = (message = "You do not have access to this") => new AppError(403, "FORBIDDEN", message);
export const notFound = (message = "Not found") => new AppError(404, "NOT_FOUND", message);
export const conflict = (code: string, message: string) => new AppError(409, code, message);
export const tooMany = (message: string) => new AppError(429, "RATE_LIMITED", message);

export function parse<S extends ZodTypeAny>(schema: S, data: unknown): output<S> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const first = r.error.issues[0];
    const where = first?.path.length ? `${first.path.join(".")}: ` : "";
    throw badRequest("VALIDATION", `${where}${first?.message ?? "Invalid input"}`);
  }
  return r.data;
}

/** Postgres unique-violation code. */
export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  const e = err as { code?: string; constraint?: string };
  return e?.code === "23505" && (!constraint || e.constraint === constraint);
}
