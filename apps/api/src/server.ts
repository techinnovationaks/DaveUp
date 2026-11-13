import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import { AppError } from "./lib/errors";
import { resolveAuth } from "./lib/context";
import { authRoutes } from "./modules/auth";
import { churchRoutes } from "./modules/church";
import { disciplerRoutes } from "./modules/disciplers";
import { relationshipRoutes } from "./modules/relationships";
import { assessmentRoutes } from "./modules/assessments";
import { cycleRoutes } from "./modules/cycles";
import { planRoutes } from "./modules/plans";
import { meetingRoutes } from "./modules/meetings";
import { appDb } from "./db/pool";
import { sql } from "kysely";
import { config } from "./config";

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.isTest ? false : { level: config.isProd ? "info" : "warn" },
    trustProxy: true,
    bodyLimit: 256 * 1024,
  });

  await app.register(cookie);
  app.decorateRequest("auth", null);
  app.addHook("onRequest", resolveAuth);

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      return reply.code(err.status).send({ error: { code: err.code, message: err.message } });
    }
    const fe = err as { statusCode?: number; validation?: unknown; message: string };
    if (fe.statusCode && fe.statusCode < 500) {
      return reply.code(fe.statusCode).send({ error: { code: "BAD_REQUEST", message: fe.message } });
    }
    req.log.error(err);
    return reply.code(500).send({ error: { code: "INTERNAL", message: "Something went wrong. Please try again." } });
  });

  // Liveness and readiness for the load balancer.
  app.get("/health", async () => ({ ok: true }));
  app.get("/ready", async (_req, reply) => {
    try {
      await sql`select 1`.execute(appDb);
      return { ok: true };
    } catch {
      return reply.code(503).send({ ok: false });
    }
  });

  await app.register(authRoutes);
  await app.register(churchRoutes);
  await app.register(disciplerRoutes);
  await app.register(relationshipRoutes);
  await app.register(assessmentRoutes);
  await app.register(cycleRoutes);
  await app.register(planRoutes);
  await app.register(meetingRoutes);

  return app;
}
