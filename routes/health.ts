import type { FastifyReply, FastifyRequest } from "fastify";

/**
 * Public liveness probe. Deliberately minimal — returns only ok/service/timestamp.
 * The Docker healthcheck and the Cloudflare Tunnel only need a 200 with ok:true.
 *
 * Codex CLI version, OAuth mode, and workspace free-MB were intentionally dropped:
 * this route is unauthenticated and publicly reachable, and those fields were
 * needless reconnaissance (audit finding infra-02). If internal ops visibility is
 * needed, add a bearer-gated /ops/status route rather than widening /health.
 */
export async function healthHandler(_req: FastifyRequest, reply: FastifyReply) {
  return reply.send({
    ok: true,
    service: "jobmagnet-codex",
    timestamp: new Date().toISOString(),
  });
}
