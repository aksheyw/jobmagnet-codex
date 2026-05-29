import type { FastifyBaseLogger } from "fastify";
import { createCodexClient } from "../lib/codex-client.js";
import { ensureWorkspace } from "../lib/workspace.js";
import { logUsage } from "../lib/usage-logger.js";
import { getSupabaseAdmin } from "../lib/supabase-admin.js";
import { fetchBrandfetch, BRAND_FALLBACK } from "../lib/brandfetch.js";
import {
  runResearchAgent,
  runResearchWithRetry,
  ResearchUnresolvedError,
  type ResearchInputs,
} from "./research-agent.js";
import { runBrandAgent } from "./brand-agent.js";
import { runNarrativeAgent } from "./narrative-agent.js";
import { runPitchAgent } from "./pitch-agent.js";
import { runCodeAgent } from "./code-agent.js";
import type { BrandStyle } from "../schemas/brand-style.js";
import type { Narrative } from "../schemas/narrative.js";
import type { PitchSection } from "../schemas/pitch-section.js";

type AgentName = "research" | "brand" | "narrative" | "code" | "pitch";

// F-orchestrator-research-guard (S15): retry ResearchAgent up to this many times
// when web_search flakes and returns an empty/unusable result. An empty
// company_domain would otherwise cascade into Brand static-fallback + Pitch
// hard-fail (a no-company portfolio). 2 = original attempt + 1 retry.
const RESEARCH_MAX_ATTEMPTS = 2;

export interface OrchestrateInputs {
  job_id: string;
  short_id: string;
  jd_url?: string;
  jd_paste_text?: string;
  parsed_profile: Record<string, unknown>;
  email?: string;
  pitch?: {
    enabled: boolean;
    stance: "builder" | "analyst" | "customer" | "strategist";
    seed: string;
  };
}

export interface OrchestrateOutcome {
  short_id: string;
  status: "completed" | "failed";
  durationMs: number;
  error?: string;
}

/**
 * End-to-end generation pipeline. Runs ResearchAgent → (Brand || Narrative || Pitch)
 * in parallel → CodeAgent. Writes `agent_states` to `generation_jobs` after each step
 * and inserts the final `generations` row on success.
 *
 * Intended to be called fire-and-forget from `/orchestrate` route — caller responds
 * 202 immediately, this function runs in the request handler's continuation.
 */
export async function orchestrate(
  inputs: OrchestrateInputs,
  log: FastifyBaseLogger,
): Promise<OrchestrateOutcome> {
  const supabase = getSupabaseAdmin();
  const codex = createCodexClient();
  const workdir = ensureWorkspace(inputs.job_id);
  const t0 = Date.now();

  await supabase
    .from("generation_jobs")
    .update({ status: "running" })
    .eq("id", inputs.job_id);

  const markState = async (
    agent: AgentName,
    state: "running" | "done" | "failed",
    extra?: Record<string, unknown>,
  ): Promise<void> => {
    const now = new Date().toISOString();
    const { data: row } = await supabase
      .from("generation_jobs")
      .select("agent_states, agent_started_at, agent_completed_at")
      .eq("id", inputs.job_id)
      .maybeSingle();

    const states = (row?.agent_states ?? {}) as Record<string, unknown>;
    const startedAt = (row?.agent_started_at ?? {}) as Record<string, string>;
    const completedAt = (row?.agent_completed_at ?? {}) as Record<string, string>;

    states[agent] = { state, ...(extra ?? {}) };
    if (state === "running" && !startedAt[agent]) startedAt[agent] = now;
    if (state === "done" || state === "failed") completedAt[agent] = now;

    await supabase
      .from("generation_jobs")
      .update({
        agent_states: states,
        agent_started_at: startedAt,
        agent_completed_at: completedAt,
      })
      .eq("id", inputs.job_id);
  };

  try {
    // ───────────────────────── Step 1: ResearchAgent ─────────────────────────
    await markState("research", "running");
    const researchInputs: ResearchInputs = inputs.jd_url
      ? { jd_url: inputs.jd_url }
      : { jd_paste_text: inputs.jd_paste_text };
    const hadJdUrl = Boolean(inputs.jd_url);

    const researchT0 = Date.now();
    // F-orchestrator-research-guard (S15): guard + retry. web_search occasionally
    // returns empty; without this an empty company_domain cascaded into a broken
    // portfolio (Brand static-fallback + Pitch hard-fail). A retry reliably
    // recovers; if the employer still can't be resolved, fail the job cleanly via
    // ResearchUnresolvedError (its message surfaces on the progress page).
    let research!: Awaited<ReturnType<typeof runResearchAgent>>;
    try {
      research = await runResearchWithRetry(
        () => runResearchAgent(codex, researchInputs, workdir),
        hadJdUrl,
        RESEARCH_MAX_ATTEMPTS,
      );
    } catch (err) {
      if (err instanceof ResearchUnresolvedError) {
        // Keep the internal `detail` in server logs only; agent_states flows to
        // the client via /api/jobs, so surface the hardened user-facing message
        // there (not detail). Other error types fall through to the outer catch,
        // which marks research failed with a generic, leak-safe reason.
        log.warn({ job_id: inputs.job_id, detail: err.detail }, "research unresolved after retries");
        await markState("research", "failed", { reason: err.message });
      }
      throw err;
    }
    await logUsage({
      jobId: inputs.job_id,
      agent: "research",
      tokensInput: research.usage.input_tokens,
      tokensOutput: research.usage.output_tokens,
      tokensCachedInput: research.usage.cached_input_tokens,
      tokensReasoningOutput: research.usage.reasoning_output_tokens,
      durationMs: research.durationMs,
    });
    log.info(
      {
        job_id: inputs.job_id,
        company: research.result.company_name,
        duration_ms: Date.now() - researchT0,
      },
      "research complete",
    );
    await markState("research", "done", { company: research.result.company_name });

    const jobContext = research.result;
    const companyDomain = jobContext.company_domain.toLowerCase();
    const companyName = jobContext.company_name;
    const targetCompany = { name: companyName, domain: companyDomain };

    // ─────────────────── Step 2: Brand + Narrative + Pitch (parallel) ───────────────────
    const pitchEnabled = inputs.pitch?.enabled === true;
    // Pitch is wrapped in its own catch so any throw inside runPitchFlow
    // (invalid domain / empty Codex response / stance mismatch) downgrades
    // to "no pitch this generation" instead of taking down brand + narrative
    // that may have already succeeded.
    const pitchT0 = Date.now();
    const pitchPromise: Promise<PitchSection | null> = pitchEnabled
      ? runPitchFlow(codex, inputs.job_id, companyDomain, companyName, inputs.pitch!, jobContext.jd_summary, workdir, markState)
          .catch(async (err) => {
            const msg = err instanceof Error ? err.message : String(err);
            log.warn(
              { job_id: inputs.job_id, err: msg },
              "pitch flow failed; continuing without pitch",
            );
            // F70: log a codex_usage row even on failure so the trail-of-work
            // sidebar accurately reflects "pitch was attempted, took N ms, returned 0 tokens".
            try {
              await logUsage({
                jobId: inputs.job_id,
                agent: "pitch",
                tokensInput: 0,
                tokensOutput: 0,
                tokensCachedInput: 0,
                tokensReasoningOutput: 0,
                durationMs: Date.now() - pitchT0,
              });
            } catch {
              /* F68: swallow telemetry errors so they don't cascade-fail Promise.all */
            }
            // F68: wrap markState in try/swallow — a Supabase outage here must NOT
            // take down brand + narrative that already succeeded.
            try {
              await markState("pitch", "failed", { reason: msg.slice(0, 200) });
            } catch {
              /* swallow */
            }
            return null;
          })
      : Promise.resolve<PitchSection | null>(null);

    const [brandResult, narrativeResult, pitchResult] = await Promise.all([
      runBrandFlow(codex, inputs.job_id, companyDomain, companyName, workdir, markState),
      runNarrativeFlow(codex, inputs.job_id, jobContext, inputs.parsed_profile, targetCompany, workdir, markState),
      pitchPromise,
    ]);

    // ───────────────────────── Step 3: CodeAgent ─────────────────────────
    await markState("code", "running");
    const code = await runCodeAgent(
      {
        brand_style: brandResult,
        narrative: narrativeResult,
        job_context: jobContext,
        pitch_section: pitchResult,
        target_company: targetCompany,
      },
      inputs.job_id,
    );
    await logUsage({
      jobId: inputs.job_id,
      agent: "code",
      tokensInput: code.usage.input_tokens,
      tokensOutput: code.usage.output_tokens,
      tokensCachedInput: code.usage.cached_input_tokens,
      tokensReasoningOutput: code.usage.reasoning_output_tokens,
      durationMs: code.durationMs,
    });
    await markState("code", "done", {
      zip_size_bytes: code.result.zip_size_bytes,
      fonts_resolved: code.result.fonts_resolved,
    });

    // ───────────────────────── Step 4: Persist generations row ─────────────────────────
    await supabase.from("generations").insert({
      job_id: inputs.job_id,
      short_id: inputs.short_id,
      anonymous_email: inputs.email ?? null,
      pitch_reviewed: !pitchEnabled || pitchResult === null, // no pitch / failed pitch → no review needed
      job_context: jobContext,
      brand_style: brandResult,
      narrative: narrativeResult,
      pitch_section: pitchResult,
      zip_url: code.result.zip_url,
      zip_size_bytes: code.result.zip_size_bytes,
      zip_generated_at: new Date().toISOString(),
    });

    await supabase
      .from("generation_jobs")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", inputs.job_id);

    return {
      short_id: inputs.short_id,
      status: "completed",
      durationMs: Date.now() - t0,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    log.error({ job_id: inputs.job_id, err: errMsg }, "orchestrate failed");

    // F75: any agents still in "running" state when this throw happened would
    // otherwise spin forever in the UI. Mark each in-flight agent as "failed"
    // so progress page renders the actual final state.
    try {
      const { data: row } = await supabase
        .from("generation_jobs")
        .select("agent_states")
        .eq("id", inputs.job_id)
        .maybeSingle();
      const states = (row?.agent_states ?? {}) as Record<
        string,
        { state?: string }
      >;
      for (const [agent, info] of Object.entries(states)) {
        if (info?.state === "running") {
          try {
            await markState(agent as AgentName, "failed", {
              reason: "orchestrator threw",
            });
          } catch {
            /* swallow per-agent markState errors */
          }
        }
      }
    } catch {
      /* swallow read failure — best-effort cleanup */
    }

    try {
      await supabase
        .from("generation_jobs")
        .update({
          status: "failed",
          error: errMsg.slice(0, 1000),
          completed_at: new Date().toISOString(),
        })
        .eq("id", inputs.job_id);
    } catch {
      /* swallow secondary failure */
    }

    return {
      short_id: inputs.short_id,
      status: "failed",
      durationMs: Date.now() - t0,
      error: errMsg,
    };
  }
}

async function runBrandFlow(
  codex: ReturnType<typeof createCodexClient>,
  jobId: string,
  domain: string,
  name: string,
  workdir: string,
  markState: (
    a: AgentName,
    s: "running" | "done" | "failed",
    extra?: Record<string, unknown>,
  ) => Promise<void>,
): Promise<BrandStyle> {
  await markState("brand", "running");
  // Primary: Brandfetch (fast, no LLM tokens). Falls through on miss.
  const brandT0 = Date.now();
  try {
    const primary = await fetchBrandfetch(domain);
    if (primary) {
      // Log a codex_usage row even on the Brandfetch fast-path so the Trail of
      // work sidebar shows 5/5 agents ran (rather than 4/5). Tokens are all 0
      // because Brandfetch is a cached HTTP fetch, not a Codex call.
      await logUsage({
        jobId,
        agent: "brand",
        tokensInput: 0,
        tokensOutput: 0,
        tokensCachedInput: 0,
        tokensReasoningOutput: 0,
        durationMs: Date.now() - brandT0,
      });
      await markState("brand", "done", { source: "brandfetch" });
      return primary;
    }
  } catch {
    /* fall through to Codex */
  }

  // Fallback: Codex BrandAgent
  try {
    const brand = await runBrandAgent(codex, { company_domain: domain, company_name: name }, workdir);
    await logUsage({
      jobId,
      agent: "brand",
      tokensInput: brand.usage.input_tokens,
      tokensOutput: brand.usage.output_tokens,
      tokensCachedInput: brand.usage.cached_input_tokens,
      tokensReasoningOutput: brand.usage.reasoning_output_tokens,
      durationMs: brand.durationMs,
    });
    await markState("brand", "done", { source: "codex-fallback" });
    return brand.result;
  } catch (err) {
    // Last-ditch: static fallback so the pipeline still completes.
    // F66: log a codex_usage row even on the static-fallback path so the trail-of-work
    // sidebar consistently shows 5/5 agents ran (Brandfetch succeeded → logged; Codex
    // BrandAgent succeeded → logged; static fallback → logged here). 0 tokens because
    // no Codex call was made.
    try {
      await logUsage({
        jobId,
        agent: "brand",
        tokensInput: 0,
        tokensOutput: 0,
        tokensCachedInput: 0,
        tokensReasoningOutput: 0,
        durationMs: Date.now() - brandT0,
      });
    } catch {
      /* swallow telemetry error — must not break the pipeline */
    }
    await markState("brand", "done", {
      source: "static-fallback",
      reason: err instanceof Error ? err.message.slice(0, 200) : "unknown",
    });
    return BRAND_FALLBACK;
  }
}

async function runNarrativeFlow(
  codex: ReturnType<typeof createCodexClient>,
  jobId: string,
  jobContext: Awaited<ReturnType<typeof runResearchAgent>>["result"],
  profile: Record<string, unknown>,
  targetCompany: { name: string; domain: string },
  workdir: string,
  markState: (
    a: AgentName,
    s: "running" | "done" | "failed",
    extra?: Record<string, unknown>,
  ) => Promise<void>,
): Promise<Narrative> {
  await markState("narrative", "running");
  const narrative = await runNarrativeAgent(
    codex,
    { job_context: jobContext, profile, target_company: targetCompany },
    workdir,
  );
  await logUsage({
    jobId,
    agent: "narrative",
    tokensInput: narrative.usage.input_tokens,
    tokensOutput: narrative.usage.output_tokens,
    tokensCachedInput: narrative.usage.cached_input_tokens,
    tokensReasoningOutput: narrative.usage.reasoning_output_tokens,
    durationMs: narrative.durationMs,
  });
  await markState("narrative", "done");
  return narrative.result;
}

async function runPitchFlow(
  codex: ReturnType<typeof createCodexClient>,
  jobId: string,
  domain: string,
  companyName: string,
  pitchInputs: NonNullable<OrchestrateInputs["pitch"]>,
  jdSummary: string,
  workdir: string,
  markState: (
    a: AgentName,
    s: "running" | "done" | "failed",
    extra?: Record<string, unknown>,
  ) => Promise<void>,
): Promise<PitchSection> {
  await markState("pitch", "running");
  const pitch = await runPitchAgent(
    codex,
    {
      company_domain: domain,
      company_name: companyName,
      stance: pitchInputs.stance,
      seed: pitchInputs.seed,
      job_context_summary: jdSummary,
    },
    workdir,
  );
  await logUsage({
    jobId,
    agent: "pitch",
    tokensInput: pitch.usage.input_tokens,
    tokensOutput: pitch.usage.output_tokens,
    tokensCachedInput: pitch.usage.cached_input_tokens,
    tokensReasoningOutput: pitch.usage.reasoning_output_tokens,
    durationMs: pitch.durationMs,
  });
  await markState("pitch", "done");
  return pitch.result;
}
