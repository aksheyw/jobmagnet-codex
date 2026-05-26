import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { createCodexClient } from "../lib/codex-client.js";
import { ensureWorkspace } from "../lib/workspace.js";
import { logUsage } from "../lib/usage-logger.js";
import { runResearchSage } from "../agents/research-sage.js";

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
  const workdir = ensureWorkspace(job_id);
  const codex = createCodexClient();

  try {
    if (agent === "research") {
      const { result, usage, durationMs, webSearchQueries } = await runResearchSage(
        codex,
        inputs as { jd_url?: string; jd_paste_text?: string },
        workdir,
      );

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
    const msg = err instanceof Error ? err.message : String(err);
    req.log.error({ err: msg, agent, job_id }, "agent invocation failed");
    return reply.code(500).send({ ok: false, error: msg });
  }
}
