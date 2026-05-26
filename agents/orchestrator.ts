import type { FastifyBaseLogger } from "fastify";
import { createCodexClient } from "../lib/codex-client.js";
import { ensureWorkspace } from "../lib/workspace.js";
import { logUsage } from "../lib/usage-logger.js";
import { getSupabaseAdmin } from "../lib/supabase-admin.js";
import { fetchBrandfetch, BRAND_FALLBACK } from "../lib/brandfetch.js";
import { runResearchSage, type ResearchInputs } from "./research-sage.js";
import { runBrandSage } from "./brand-sage.js";
import { runNarrativeSage } from "./narrative-sage.js";
import { runPitchSage } from "./pitch-sage.js";
import { runCodeSage } from "./code-sage.js";
import type { BrandStyle } from "../schemas/brand-style.js";
import type { Narrative } from "../schemas/narrative.js";
import type { PitchSection } from "../schemas/pitch-section.js";

type AgentName = "research" | "brand" | "narrative" | "code" | "pitch";

export interface OrchestrateInputs {
  job_id: string;
  short_id: string;
  jd_url?: string;
  jd_paste_text?: string;
  parsed_profile: Record<string, unknown>;
  email?: string;
  pitchsage?: {
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
 * End-to-end generation pipeline. Runs ResearchSage → (Brand || Narrative || Pitch)
 * in parallel → CodeSage. Writes `agent_states` to `generation_jobs` after each step
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
    // ───────────────────────── Step 1: ResearchSage ─────────────────────────
    await markState("research", "running");
    const researchInputs: ResearchInputs = inputs.jd_url
      ? { jd_url: inputs.jd_url }
      : { jd_paste_text: inputs.jd_paste_text };

    const researchT0 = Date.now();
    const research = await runResearchSage(codex, researchInputs, workdir);
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
    const pitchEnabled = inputs.pitchsage?.enabled === true;
    const [brandResult, narrativeResult, pitchResult] = await Promise.all([
      runBrandFlow(codex, inputs.job_id, companyDomain, companyName, workdir, markState),
      runNarrativeFlow(codex, inputs.job_id, jobContext, inputs.parsed_profile, targetCompany, workdir, markState),
      pitchEnabled
        ? runPitchFlow(codex, inputs.job_id, companyDomain, companyName, inputs.pitchsage!, jobContext.jd_summary, workdir, markState)
        : Promise.resolve<PitchSection | null>(null),
    ]);

    // ───────────────────────── Step 3: CodeSage ─────────────────────────
    await markState("code", "running");
    const code = await runCodeSage(
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
      pitch_reviewed: !pitchEnabled, // no pitch → no review needed
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
  try {
    const primary = await fetchBrandfetch(domain);
    if (primary) {
      await markState("brand", "done", { source: "brandfetch" });
      return primary;
    }
  } catch {
    /* fall through to Codex */
  }

  // Fallback: Codex BrandSage
  try {
    const brand = await runBrandSage(codex, { company_domain: domain, company_name: name }, workdir);
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
    // Last-ditch: static fallback so the pipeline still completes
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
  jobContext: Awaited<ReturnType<typeof runResearchSage>>["result"],
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
  const narrative = await runNarrativeSage(
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
  pitchsage: NonNullable<OrchestrateInputs["pitchsage"]>,
  jdSummary: string,
  workdir: string,
  markState: (
    a: AgentName,
    s: "running" | "done" | "failed",
    extra?: Record<string, unknown>,
  ) => Promise<void>,
): Promise<PitchSection> {
  await markState("pitch", "running");
  const pitch = await runPitchSage(
    codex,
    {
      company_domain: domain,
      company_name: companyName,
      stance: pitchsage.stance,
      seed: pitchsage.seed,
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
