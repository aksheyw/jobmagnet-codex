import Fastify from "fastify";
import { readFileSync } from "node:fs";
import { healthHandler } from "./routes/health.js";
import { runAgentHandler } from "./routes/run-agent.js";

const PORT = Number(process.env.VPS_PORT ?? 8443);

const SHARED_SECRET = (() => {
  try {
    return readFileSync("/root/.jobmagnet/secret", "utf8").trim();
  } catch (err) {
    console.error("Failed to read /root/.jobmagnet/secret:", err);
    process.exit(1);
  }
})();

const app = Fastify({
  logger: { level: process.env.LOG_LEVEL ?? "info" },
  bodyLimit: 30 * 1024 * 1024,
});

app.addHook("onRequest", async (request, reply) => {
  if (request.url === "/health" || request.url === "/health/") return;
  const auth = request.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return reply.code(401).send({ ok: false, error: "missing bearer token" });
  }
  const token = auth.slice("Bearer ".length);
  if (token !== SHARED_SECRET) {
    return reply.code(401).send({ ok: false, error: "invalid bearer token" });
  }
});

app.get("/health", healthHandler);
app.post("/run-agent", runAgentHandler);

const start = async () => {
  try {
    await app.listen({ port: PORT, host: "0.0.0.0" });
    app.log.info(`jobmagnet-codex listening on :${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
