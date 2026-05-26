import type { Codex } from "@openai/codex-sdk";
import {
  JobContextJsonSchema,
  JobContextSchema,
  type JobContext,
} from "../schemas/job-context.js";

export interface ResearchInputs {
  jd_url?: string;
  jd_paste_text?: string;
}

export interface ResearchResult {
  result: JobContext;
  usage: {
    input_tokens: number;
    cached_input_tokens: number;
    output_tokens: number;
    reasoning_output_tokens: number;
  };
  durationMs: number;
  webSearchQueries: string[];
}

export async function runResearchSage(
  codex: Codex,
  inputs: ResearchInputs,
  workingDirectory: string,
): Promise<ResearchResult> {
  if (!inputs.jd_url && !inputs.jd_paste_text) {
    throw new Error("ResearchSage requires jd_url OR jd_paste_text");
  }

  const t0 = Date.now();
  const thread = codex.startThread({
    skipGitRepoCheck: true,
    workingDirectory,
    sandboxMode: "workspace-write",
    approvalPolicy: "never",
    webSearchEnabled: true,
    networkAccessEnabled: true,
  });

  const prompt = buildPrompt(inputs);
  const turn = await thread.run(prompt, { outputSchema: JobContextJsonSchema });
  const durationMs = Date.now() - t0;

  if (!turn.finalResponse) {
    throw new Error("ResearchSage: empty finalResponse from Codex");
  }

  const parsed = JSON.parse(turn.finalResponse);
  const validated = JobContextSchema.parse(parsed);

  const webSearchQueries = turn.items
    .filter((item) => item.type === "web_search")
    .map((item) => (item as { query: string }).query);

  const usage = turn.usage ?? {
    input_tokens: 0,
    cached_input_tokens: 0,
    output_tokens: 0,
    reasoning_output_tokens: 0,
  };

  return { result: validated, usage, durationMs, webSearchQueries };
}

function buildPrompt(inputs: ResearchInputs): string {
  if (inputs.jd_url) {
    return `You are ResearchSage, an agent that extracts structured job context from a job posting page.

TASK: Use the web_search tool to fetch ${inputs.jd_url}. Synthesize a structured JobContext JSON.

CONSTRAINTS:
- Only fetch http:// and https:// URLs from the company's own domain (extracted from the JD URL) and the JD URL itself.
- If a page is paywalled or behind auth, return partial JobContext with degraded: true and use what you can infer from the JD URL alone.
- pitchsage_suggested_stance: infer the most natural critique stance for this role:
  - Engineering / Product / Design → "builder"
  - UX / Research / Product Marketing → "analyst"
  - Customer Success / Support → "customer"
  - Senior Strategy / BD / Senior PM → "strategist"

OUTPUT: JSON matching the provided schema. All fields required.`;
  }

  const text = (inputs.jd_paste_text ?? "").slice(0, 8000);
  return `You are ResearchSage, an agent that extracts structured job context from a pasted job description.

JD TEXT:
"""
${text}
"""

TASK: Extract company_name, company_domain (inferred from text — likely "<company>.com"), job_title, summary, must-have skills, nice-to-have skills, responsibilities, team context, location, career level, suggested PitchSage stance, and a degraded flag (true if information is insufficient).

OUTPUT: JSON matching the provided schema. All fields required.`;
}
