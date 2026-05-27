import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { createCodexClient } from "../lib/codex-client.js";
import { ensureWorkspace } from "../lib/workspace.js";
import { logUsage } from "../lib/usage-logger.js";
import { validatePublicUrl } from "../lib/url-validator.js";
import { runResearchAgent } from "../agents/research-agent.js";
import { runBrandAgent } from "../agents/brand-agent.js";
import { runNarrativeAgent } from "../agents/narrative-agent.js";
import { runPitchAgent } from "../agents/pitch-agent.js";
import { runCodeAgent } from "../agents/code-agent.js";
import { JobContextSchema } from "../schemas/job-context.js";
import { BrandStyleSchema } from "../schemas/brand-style.js";
import { NarrativeSchema } from "../schemas/narrative.js";
import { PitchSectionSchema } from "../schemas/pitch-section.js";

const BodySchema = z.object({
  agent: z.enum(["research", "brand", "narrative", "code", "pitch"]),
  job_id: z.string().regex(/^[a-zA-Z0-9_-]+$/, "job_id must be alphanumeric/_/-"),
  inputs: z.record(z.unknown()),
});

const ResearchInputsSchema = z.object({
  jd_url: z.string().url().optional(),
  jd_paste_text: z.string().optional(),
}).refine(
  (v) => Boolean(v.jd_url) || Boolean(v.jd_paste_text),
  { message: "research requires jd_url OR jd_paste_text" },
);

const BrandInputsSchema = z.object({
  company_domain: z.string().min(3),
  company_name: z.string().optional(),
});

const TargetCompanySchema = z.object({
  name: z.string().min(1),
  domain: z.string().min(3),
});

const ParsedProfileSchema = z.object({
  name: z.string().optional(),
  headline: z.string().optional(),
  about: z.string().optional(),
  work_history: z.array(z.object({
    company: z.string().optional(),
    title: z.string().optional(),
    dates: z.string().optional(),
    bullets: z.array(z.string()).optional(),
  })).optional(),
  skills: z.array(z.string()).optional(),
}).passthrough();

const NarrativeInputsSchema = z.object({
  job_context: JobContextSchema,
  profile: ParsedProfileSchema,
  brand_style: BrandStyleSchema.nullable().optional(),
  target_company: TargetCompanySchema,
});

const PitchInputsSchema = z.object({
  company_domain: z.string().min(3),
  company_name: z.string().min(1),
  stance: z.enum(["builder", "analyst", "customer", "strategist"]),
  seed: z.string().min(1),
  job_context_summary: z.string().min(1),
});

const CodeInputsSchema = z.object({
  brand_style: BrandStyleSchema,
  narrative: NarrativeSchema,
  job_context: JobContextSchema,
  pitch_section: PitchSectionSchema.nullable().optional(),
  target_company: TargetCompanySchema,
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

  // SSRF guard for any jd_url field anywhere in inputs (defense in depth).
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

  try {
    if (agent === "research") {
      return await handleResearch(req, reply, inputs, workdir, job_id);
    }
    if (agent === "brand") {
      return await handleBrand(req, reply, inputs, workdir, job_id);
    }
    if (agent === "narrative") {
      return await handleNarrative(req, reply, inputs, workdir, job_id);
    }
    if (agent === "pitch") {
      return await handlePitch(req, reply, inputs, workdir, job_id);
    }
    if (agent === "code") {
      return await handleCode(req, reply, inputs, job_id);
    }

    return reply.code(400).send({
      ok: false,
      error: `unknown agent ${agent satisfies never}`,
    });
  } catch (err) {
    req.log.error({ err, agent, job_id }, "agent invocation failed");
    return reply.code(500).send({ ok: false, error: "agent invocation failed" });
  }
}

async function handleResearch(
  req: FastifyRequest,
  reply: FastifyReply,
  rawInputs: Record<string, unknown>,
  workdir: string,
  jobId: string,
) {
  const parsed = ResearchInputsSchema.safeParse(rawInputs);
  if (!parsed.success) {
    return reply.code(400).send({
      ok: false,
      error: "invalid research inputs",
      details: parsed.error.flatten(),
    });
  }
  const codex = createCodexClient();
  const { result, usage, durationMs, webSearchQueries } = await runResearchAgent(
    codex,
    parsed.data,
    workdir,
  );

  if (parsed.data.jd_url && webSearchQueries.length === 0) {
    req.log.warn(
      { job_id: jobId, jd_url: parsed.data.jd_url },
      "research agent skipped web_search",
    );
    return reply.code(502).send({
      ok: false,
      error: "research agent did not fetch the JD URL — retry recommended",
    });
  }

  await logUsage({
    jobId,
    agent: "research",
    tokensInput: usage.input_tokens,
    tokensOutput: usage.output_tokens,
    tokensCachedInput: usage.cached_input_tokens,
    tokensReasoningOutput: usage.reasoning_output_tokens,
    durationMs,
  });

  return reply.send({
    ok: true,
    agent: "research",
    job_id: jobId,
    result,
    usage,
    durationMs,
    webSearchQueries,
  });
}

async function handleBrand(
  req: FastifyRequest,
  reply: FastifyReply,
  rawInputs: Record<string, unknown>,
  workdir: string,
  jobId: string,
) {
  const parsed = BrandInputsSchema.safeParse(rawInputs);
  if (!parsed.success) {
    return reply.code(400).send({
      ok: false,
      error: "invalid brand inputs",
      details: parsed.error.flatten(),
    });
  }
  const codex = createCodexClient();
  const { result, usage, durationMs, webSearchQueries } = await runBrandAgent(
    codex,
    parsed.data,
    workdir,
  );

  if (webSearchQueries.length === 0) {
    req.log.warn(
      { job_id: jobId, domain: parsed.data.company_domain },
      "brand agent skipped web_search — using likely-fabricated defaults",
    );
  }

  await logUsage({
    jobId,
    agent: "brand",
    tokensInput: usage.input_tokens,
    tokensOutput: usage.output_tokens,
    tokensCachedInput: usage.cached_input_tokens,
    tokensReasoningOutput: usage.reasoning_output_tokens,
    durationMs,
  });

  return reply.send({
    ok: true,
    agent: "brand",
    job_id: jobId,
    result,
    usage,
    durationMs,
    webSearchQueries,
  });
}

async function handleNarrative(
  req: FastifyRequest,
  reply: FastifyReply,
  rawInputs: Record<string, unknown>,
  workdir: string,
  jobId: string,
) {
  const parsed = NarrativeInputsSchema.safeParse(rawInputs);
  if (!parsed.success) {
    return reply.code(400).send({
      ok: false,
      error: "invalid narrative inputs",
      details: parsed.error.flatten(),
    });
  }
  const codex = createCodexClient();
  const { result, usage, durationMs } = await runNarrativeAgent(
    codex,
    parsed.data,
    workdir,
  );

  await logUsage({
    jobId,
    agent: "narrative",
    tokensInput: usage.input_tokens,
    tokensOutput: usage.output_tokens,
    tokensCachedInput: usage.cached_input_tokens,
    tokensReasoningOutput: usage.reasoning_output_tokens,
    durationMs,
  });

  return reply.send({
    ok: true,
    agent: "narrative",
    job_id: jobId,
    result,
    usage,
    durationMs,
  });
}

async function handlePitch(
  req: FastifyRequest,
  reply: FastifyReply,
  rawInputs: Record<string, unknown>,
  workdir: string,
  jobId: string,
) {
  const parsed = PitchInputsSchema.safeParse(rawInputs);
  if (!parsed.success) {
    return reply.code(400).send({
      ok: false,
      error: "invalid pitch inputs",
      details: parsed.error.flatten(),
    });
  }
  const codex = createCodexClient();
  const { result, usage, durationMs, webSearchQueries } = await runPitchAgent(
    codex,
    parsed.data,
    workdir,
  );

  await logUsage({
    jobId,
    agent: "pitch",
    tokensInput: usage.input_tokens,
    tokensOutput: usage.output_tokens,
    tokensCachedInput: usage.cached_input_tokens,
    tokensReasoningOutput: usage.reasoning_output_tokens,
    durationMs,
  });

  return reply.send({
    ok: true,
    agent: "pitch",
    job_id: jobId,
    result,
    usage,
    durationMs,
    webSearchQueries,
  });
}

async function handleCode(
  _req: FastifyRequest,
  reply: FastifyReply,
  rawInputs: Record<string, unknown>,
  jobId: string,
) {
  const parsed = CodeInputsSchema.safeParse(rawInputs);
  if (!parsed.success) {
    return reply.code(400).send({
      ok: false,
      error: "invalid code inputs",
      details: parsed.error.flatten(),
    });
  }
  const { result, usage, durationMs } = await runCodeAgent(parsed.data, jobId);

  // CodeAgent is deterministic — log duration only (tokens all 0).
  await logUsage({
    jobId,
    agent: "code",
    tokensInput: usage.input_tokens,
    tokensOutput: usage.output_tokens,
    tokensCachedInput: usage.cached_input_tokens,
    tokensReasoningOutput: usage.reasoning_output_tokens,
    durationMs,
  });

  return reply.send({
    ok: true,
    agent: "code",
    job_id: jobId,
    result,
    usage,
    durationMs,
  });
}
