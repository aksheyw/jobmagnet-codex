/**
 * Regression test for the orchestrator research-quality guard + retry
 * (F-orchestrator-research-guard, found S15 2026-05-29).
 *
 * BUG: the orchestrator consumed ResearchAgent output unconditionally, while
 * /run-agent guards it (502 "retry recommended" when a jd_url run did no
 * web_search). When research returned an empty company_domain, that empty
 * string reached BrandAgent + PitchAgent, whose DOMAIN_REGEX throws on it
 * (brand-agent.ts:32) → brand static-fallback + pitch hard-fail → a
 * no-company portfolio. These tests pin the guard decision + retry/fail-clean.
 *
 * Run: `npx tsx scripts/regression-research-guard.ts`
 * (codex repo has no vitest — matches scripts/regression-normalize-domain.ts.)
 *
 * See the ai-regression-testing skill: a guard added to one path (/run-agent)
 * but not the other (/orchestrate) is the #1 AI-introduced regression pattern.
 */
import {
  assessResearchResult,
  runResearchWithRetry,
  ResearchUnresolvedError,
  type ResearchResult,
} from "../agents/research-agent.js";
import type { JobContext } from "../schemas/job-context.js";

const baseCtx: JobContext = {
  job_title: "Product Manager, Growth",
  company_name: "Sarvam",
  company_domain: "sarvam.ai",
  jd_summary: "x",
  must_have_skills: [],
  nice_to_have_skills: [],
  responsibilities: [],
  team_context: "",
  location: "",
  career_level: "senior",
  pitch_suggested_stance: "strategist",
  degraded: false,
};

function res(over: Partial<JobContext>, webSearchQueries: string[]): ResearchResult {
  return {
    result: { ...baseCtx, ...over },
    usage: { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0 },
    durationMs: 1,
    webSearchQueries,
  };
}

let total = 0;
let failed = 0;
function check(name: string, cond: boolean): void {
  total++;
  if (!cond) failed++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
}

// ── assessResearchResult: the guard decision ──
check(
  "good result (domain + name + web_search) is usable",
  assessResearchResult({ company_domain: "sarvam.ai", company_name: "Sarvam" }, ["q"], true).usable === true,
);
check(
  "empty company_domain is unusable (would throw in BrandAgent)",
  assessResearchResult({ company_domain: "", company_name: "Sarvam" }, ["q"], true).usable === false,
);
check(
  "whitespace company_domain is unusable",
  assessResearchResult({ company_domain: "   ", company_name: "Sarvam" }, ["q"], true).usable === false,
);
check(
  "empty company_name is unusable (PitchAgent requires it)",
  assessResearchResult({ company_domain: "sarvam.ai", company_name: "" }, ["q"], true).usable === false,
);
check(
  "jd_url + zero web_search is unusable (mirrors /run-agent guard)",
  assessResearchResult({ company_domain: "sarvam.ai", company_name: "Sarvam" }, [], true).usable === false,
);
check(
  "paste path (no jd_url) + zero web_search is usable",
  assessResearchResult({ company_domain: "stripe.com", company_name: "Stripe" }, [], false).usable === true,
);
check(
  "non-empty but invalid domain ('unknown') is unusable (would fail Brand/Pitch DOMAIN_REGEX)",
  assessResearchResult({ company_domain: "unknown", company_name: "Sarvam" }, ["q"], true).usable === false,
);
check(
  "multi-label domain (google.co.uk) is usable (regex must not over-reject)",
  assessResearchResult({ company_domain: "google.co.uk", company_name: "Google" }, ["q"], true).usable === true,
);
check(
  "IPv4 address as domain is unusable (not an employer domain; SSRF-adjacent if fetched)",
  assessResearchResult({ company_domain: "192.168.1.1", company_name: "X" }, ["q"], true).usable === false,
);

// ── runResearchWithRetry: the retry/fail-clean loop ──
{
  let calls = 0;
  const out = await runResearchWithRetry(async () => { calls++; return res({}, ["q"]); }, true, 2);
  check("first attempt usable → returned, exactly 1 call", out.result.company_domain === "sarvam.ai" && calls === 1);
}
{
  let calls = 0;
  const out = await runResearchWithRetry(async () => {
    calls++;
    return calls === 1 ? res({ company_domain: "" }, ["q"]) : res({}, ["q"]);
  }, true, 2);
  check("bad-then-good → recovers on attempt 2", out.result.company_domain === "sarvam.ai" && calls === 2);
}
{
  let calls = 0;
  let threw: unknown;
  try {
    await runResearchWithRetry(async () => { calls++; return res({ company_domain: "" }, ["q"]); }, true, 2);
  } catch (e) {
    threw = e;
  }
  check(
    "all attempts bad → throws ResearchUnresolvedError after maxAttempts",
    threw instanceof ResearchUnresolvedError && calls === 2,
  );
  check(
    "ResearchUnresolvedError carries a user-facing message",
    threw instanceof ResearchUnresolvedError && /employer/i.test(threw.message),
  );
}

// ── runResearchWithRetry: a THROWN attempt (transient Codex/network) is also retried ──
{
  let calls = 0;
  let recovered = false;
  try {
    const out = await runResearchWithRetry(async () => {
      calls++;
      if (calls === 1) throw new Error("transient codex blip");
      return res({}, ["q"]);
    }, true, 2);
    recovered = out.result.company_domain === "sarvam.ai" && calls === 2;
  } catch {
    recovered = false;
  }
  check("thrown attempt then good → retries past the throw and recovers", recovered);
}
{
  let calls = 0;
  let threw: unknown;
  try {
    await runResearchWithRetry(async () => { calls++; throw new Error("ResearchAgent: empty finalResponse from Codex"); }, true, 2);
  } catch (e) {
    threw = e;
  }
  check(
    "always throws → ResearchUnresolvedError (clean, not the raw internal message) after maxAttempts",
    threw instanceof ResearchUnresolvedError && calls === 2,
  );
}

console.log(`\n${total - failed}/${total} passed`);
if (failed > 0) {
  console.error(`REGRESSION: ${failed} research-guard case(s) failed`);
  process.exit(1);
}
