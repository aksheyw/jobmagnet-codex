import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import { readFileSync } from "node:fs";
import { timingSafeEqual } from "node:crypto";
import { healthHandler } from "./routes/health.js";
import { runAgentHandler } from "./routes/run-agent.js";
import { downloadHandler } from "./routes/download.js";
import { orchestrateHandler } from "./routes/orchestrate.js";

const PORT = Number(process.env.VPS_PORT ?? 8443);

const SHARED_SECRET = (() => {
  try {
    return readFileSync("/root/.jobmagnet/secret", "utf8").trim();
  } catch (err) {
    console.error("Failed to read /root/.jobmagnet/secret:", err);
    process.exit(1);
  }
})();

const SECRET_BUF = Buffer.from(SHARED_SECRET);

const app = Fastify({
  logger: { level: process.env.LOG_LEVEL ?? "info" },
  // 256KB — a JD URL + 8000-char pasted text + JSON envelope is <16KB.
  // 30MB on an unauthenticated-path body was a DoS surface; tightening it.
  bodyLimit: 256 * 1024,
});

// Rate limit /run-agent only (allow /health for docker healthchecks).
// 10 req/min/IP is generous for legitimate use and cheap to enforce.
await app.register(rateLimit, { global: false });

app.addHook("onRequest", async (request, reply) => {
  // Public, unauthenticated routes (auth happens inside the handler if needed).
  if (request.url === "/health" || request.url === "/health/") return;
  if (request.url.startsWith("/download/")) return; // signed token = auth

  const auth = request.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return reply.code(401).send({ ok: false, error: "missing bearer token" });
  }
  const token = auth.slice("Bearer ".length);
  const tokenBuf = Buffer.from(token);
  // timingSafeEqual requires equal lengths; length itself isn't secret here
  // (it's a 64-hex-char shared secret known to anyone reading our env).
  if (tokenBuf.length !== SECRET_BUF.length || !timingSafeEqual(tokenBuf, SECRET_BUF)) {
    return reply.code(401).send({ ok: false, error: "invalid bearer token" });
  }
});

app.get("/health", healthHandler);
app.post(
  "/run-agent",
  { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
  runAgentHandler,
);
app.post(
  "/orchestrate",
  { config: { rateLimit: { max: 6, timeWindow: "1 minute" } } },
  orchestrateHandler,
);
app.get(
  "/download/:jobId",
  { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
  downloadHandler,
);

const start = async () => {
  try {
    // Bind 0.0.0.0 inside the container is required for the docker-compose
    // port-publish (127.0.0.1:8443:8443) to forward traffic. The container's
    // default network is isolated from sibling compose projects, and only
    // the host's 127.0.0.1 port is exposed externally — Cloudflare Tunnel is
    // the sole public entry. See docker-compose.yml.
    await app.listen({ port: PORT, host: "0.0.0.0" });
    app.log.info(`jobmagnet-codex listening on :${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
