import type { Codex } from "@openai/codex-sdk";
import {
  BrandStyleJsonSchema,
  BrandStyleSchema,
  type BrandStyle,
} from "../schemas/brand-style.js";

export interface BrandInputs {
  company_domain: string;
  company_name?: string;
}

export interface BrandResult {
  result: BrandStyle;
  usage: {
    input_tokens: number;
    cached_input_tokens: number;
    output_tokens: number;
    reasoning_output_tokens: number;
  };
  durationMs: number;
  webSearchQueries: string[];
}

const DOMAIN_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

export async function runBrandAgent(
  codex: Codex,
  inputs: BrandInputs,
  workingDirectory: string,
): Promise<BrandResult> {
  if (!DOMAIN_REGEX.test(inputs.company_domain)) {
    throw new Error(`BrandAgent: invalid company_domain ${inputs.company_domain}`);
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
  const turn = await thread.run(prompt, { outputSchema: BrandStyleJsonSchema });
  const durationMs = Date.now() - t0;

  if (!turn.finalResponse) {
    throw new Error("BrandAgent: empty finalResponse from Codex");
  }

  const parsed = JSON.parse(turn.finalResponse);
  const validated = BrandStyleSchema.parse(parsed);

  if (validated.source !== "codex-fallback") {
    throw new Error(
      `BrandAgent: expected source=codex-fallback, got ${validated.source}`,
    );
  }

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

function buildPrompt(inputs: BrandInputs): string {
  const companyLabel = inputs.company_name
    ? `${inputs.company_name} (${inputs.company_domain})`
    : inputs.company_domain;

  return `You are BrandAgent, an agent that extracts a company's visual brand identity from its homepage.

TASK:
1. You MUST call web_search at least once to fetch https://${inputs.company_domain} (the company's homepage).
2. From the FETCHED content, infer the visual brand identity for ${companyLabel}.

OUTPUT FIELDS:
- **primary** — hex color (format "#RRGGBB"). The dominant CTA / nav-link / logo color on the page.
- **secondary** — hex color. A supporting accent (lighter / tint of primary, or a complementary).
- **background** — hex color. The page's main background (usually white-ish "#FFFFFF" or off-white "#FAFAFF").
- **headline_font** — font family used for big headings (e.g., "Inter", "DM Serif Display", "IBM Plex Sans", "GT Walsheim"). Use the actual font name from the page's CSS or text-rendering hints. Use Google Fonts names where possible.
- **body_font** — font family used for body text (often same as headline_font for minimal sites, often different for editorial sites).
- **mood** — one of: "minimal" | "editorial" | "systematic" | "tech-dark" | "warm-creative". Pick the closest match. Stripe/Linear/Plaid are "minimal" or "systematic". The New York Times is "editorial". Vercel is "minimal". An indie design studio with playful illustrations is "warm-creative".
- **source** — ALWAYS the literal string "codex-fallback" (this agent only runs when Brandfetch fails or returns insufficient data).

HARD REQUIREMENTS:
- Do NOT guess from your training data. Every field must come from the fetched page content.
- If the page fetch fails or returns empty, fall back to safe defaults: primary "#0F172A", secondary "#475569", background "#FFFFFF", headline_font "Inter", body_font "Inter", mood "minimal". Still set source to "codex-fallback".
- Hex values MUST be exactly 6 digits with leading "#". Never use 3-digit hex, named colors, or rgba().

OUTPUT: JSON matching the provided schema. All fields required.`;
}
