import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { createCodexClient } from "../lib/codex-client.js";
import { ensureWorkspace } from "../lib/workspace.js";
import { logUsage } from "../lib/usage-logger.js";
import { runResearchSage } from "../agents/research-sage.js";
import { validatePublicUrl } from "../lib/url-validator.js";

const BodySchema = z.object({
  agent: z.enum(["research", "brand", "narrative", "code", "pitch"]),
  job_id: z.string().regex(/^[a-zA-Z0-9_-]+$/, "job_id must be alphanumeric/_/-"),
  inputs: z.record(z.unknown()),
});

export async function runAgentHandler(req: FastifyRequest, reply: FastifyReply) {
  const parseResult = BodySchema.safeParse(req.body);
  if (!parseResult.success) {
    return reply.code(400).send({
      ok: false,
      error: "invalid request body",
      details: parseResult.error.flatten(),
    });
  }

  const { agent, job_id, inputs } = parseResult.data;

  // SSRF guard: jd_url goes into a prompt that Codex's web_search will follow.
  // Block loopback/private/encoded IPs at the route boundary, BEFORE any
  // tokens are spent. The prompt's "same-domain" sentence is cooperation,
  // not a constraint.
  if (typeof inputs.jd_url === "string") {
    const validation = validatePublicUrl(inputs.jd_url);
    if (!validation.ok) {
      return reply.code(400).send({
        ok: false,
        error: `invalid jd_url: ${validation.error}`,
      });
    }
  }

  const workdir = ensureWorkspace(job_id);
  const codex = createCodexClient();

  try {
    if (agent === "research") {
      const researchInputs = inputs as { jd_url?: string; jd_paste_text?: string };
      const { result, usage, durationMs, webSearchQueries } = await runResearchSage(
        codex,
        researchInputs,
        workdir,
      );

      // Defense in depth: if jd_url was provided, the agent MUST have called
      // web_search. Empty webSearchQueries means the agent generated from
      // training data — that was the "degraded:true shortcut" we already
      // patched in the prompt; this is the server-side enforcement.
      if (researchInputs.jd_url && webSearchQueries.length === 0) {
        req.log.warn({ job_id, jd_url: researchInputs.jd_url }, "research agent skipped web_search");
        return reply.code(502).send({
          ok: false,
          error: "research agent did not fetch the JD URL — retry recommended",
        });
      }

      await logUsage({
        jobId: job_id,
        agent: "research",
        tokensInput: usage.input_tokens,
        tokensOutput: usage.output_tokens,
        tokensCachedInput: usage.cached_input_tokens,
        tokensReasoningOutput: usage.reasoning_output_tokens,
        durationMs,
      });

      return reply.send({
        ok: true,
        agent,
        job_id,
        result,
        usage,
        durationMs,
        webSearchQueries,
      });
    }

    return reply.code(400).send({
      ok: false,
      error: `agent ${agent} is not implemented on Day 1`,
    });
  } catch (err) {
    // Sanitize error responses: log details server-side, return a generic
    // message to the caller. Stack traces and SDK internals must not leak
    // through the public Vercel /api/research response.
    req.log.error({ err, agent, job_id }, "agent invocation failed");
    return reply.code(500).send({ ok: false, error: "agent invocation failed" });
  }
}
