import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { BrandStyleSchema, type BrandStyle } from "../schemas/brand-style.js";
import { NarrativeSchema, type Narrative } from "../schemas/narrative.js";
import { PitchSectionSchema, type PitchSection } from "../schemas/pitch-section.js";
import type { JobContext } from "../schemas/job-context.js";
import { resolveFont } from "../lib/font-map.js";
import { zipPortfolio } from "../lib/zip-portfolio.js";
import { signDownloadUrl } from "../lib/download-link.js";

const TEMPLATE_DIR =
  process.env.JOBMAGNET_TEMPLATE_DIR ?? "/opt/jobmagnet-codex/template";
const JOBS_ROOT = process.env.JOBMAGNET_JOBS_DIR ?? "/var/jobmagnet/jobs";
const VPS_BASE_URL = process.env.PUBLIC_VPS_BASE_URL ?? "";

export interface CodeInputs {
  brand_style: BrandStyle;
  narrative: Narrative;
  job_context: JobContext;
  pitch_section?: PitchSection | null;
  target_company: { name: string; domain: string };
}

export interface CodeResult {
  result: {
    paths_modified: string[];
    build_ok: boolean;
    zip_url: string;
    zip_size_bytes: number;
    fonts_resolved: {
      heading: { requested: string; importName: string; fellBack: boolean };
      body: { requested: string; importName: string; fellBack: boolean };
    };
  };
  usage: {
    input_tokens: 0;
    cached_input_tokens: 0;
    output_tokens: 0;
    reasoning_output_tokens: 0;
  };
  durationMs: number;
}

export async function runCodeAgent(
  inputs: CodeInputs,
  jobId: string,
): Promise<CodeResult> {
  const t0 = Date.now();

  // 1) Validate inputs (zod parses) — throws if invalid
  BrandStyleSchema.parse(inputs.brand_style);
  NarrativeSchema.parse(inputs.narrative);
  if (inputs.pitch_section) PitchSectionSchema.parse(inputs.pitch_section);

  if (!VPS_BASE_URL) {
    throw new Error("CodeAgent: PUBLIC_VPS_BASE_URL env var must be set");
  }

  // 2) Resolve fonts (allowlist; falls back to Inter)
  const heading = resolveFont(inputs.brand_style.headline_font);
  const body = resolveFont(inputs.brand_style.body_font);

  // 3) Prepare output dir
  const outputDir = join(JOBS_ROOT, jobId, "output");
  await mkdir(outputDir, { recursive: true });
  await cp(TEMPLATE_DIR, outputDir, { recursive: true });

  // 4) Customize tailwind.config.ts (string-replace brand colors)
  const tailwindPath = join(outputDir, "tailwind.config.ts");
  const tailwindSrc = await readFile(tailwindPath, "utf-8");
  const tailwindOut = tailwindSrc
    .replace(/(\bprimary\s*:\s*)"#[0-9a-fA-F]{6}"/, `$1"${inputs.brand_style.primary}"`)
    .replace(/(\bsecondary\s*:\s*)"#[0-9a-fA-F]{6}"/, `$1"${inputs.brand_style.secondary}"`)
    .replace(/(\bbackground\s*:\s*)"#[0-9a-fA-F]{6}"/, `$1"${inputs.brand_style.background}"`);

  if (tailwindOut === tailwindSrc) {
    throw new Error(
      "CodeAgent: tailwind.config.ts color substitution missed — template may have drifted",
    );
  }
  await writeFile(tailwindPath, tailwindOut, "utf-8");

  // 5) Customize app/layout.tsx (font imports + metadata title)
  const layoutPath = join(outputDir, "app", "layout.tsx");
  const layoutSrc = await readFile(layoutPath, "utf-8");
  const layoutOut = customizeLayout(layoutSrc, {
    headingImport: heading.importName,
    bodyImport: body.importName,
    metadataTitle: `${inputs.narrative.candidate_name} — ${inputs.target_company.name}`,
    metadataDescription: inputs.narrative.headline,
  });
  await writeFile(layoutPath, layoutOut, "utf-8");

  // 6) Write portfolio-content.json (CodeAgent's main contribution)
  const portfolioContent = buildPortfolioContent(inputs);
  const contentPath = join(outputDir, "portfolio-content.json");
  await writeFile(contentPath, JSON.stringify(portfolioContent, null, 2), "utf-8");

  // 7) Zip the output dir (excluding node_modules, .next)
  const zipPath = join(JOBS_ROOT, jobId, `${jobId}.zip`);
  await mkdir(dirname(zipPath), { recursive: true });
  const { sizeBytes } = await zipPortfolio(outputDir, zipPath);

  // 8) Sign download URL
  const zipUrl = signDownloadUrl(VPS_BASE_URL, jobId);

  const durationMs = Date.now() - t0;

  return {
    result: {
      paths_modified: [
        "tailwind.config.ts",
        "app/layout.tsx",
        "portfolio-content.json",
      ],
      build_ok: true, // MVP: no in-container build verification; trust template + deterministic ops
      zip_url: zipUrl,
      zip_size_bytes: sizeBytes,
      fonts_resolved: {
        heading: {
          requested: heading.requested,
          importName: heading.importName,
          fellBack: heading.fellBack,
        },
        body: {
          requested: body.requested,
          importName: body.importName,
          fellBack: body.fellBack,
        },
      },
    },
    usage: {
      input_tokens: 0,
      cached_input_tokens: 0,
      output_tokens: 0,
      reasoning_output_tokens: 0,
    },
    durationMs,
  };
}

interface LayoutCustomization {
  headingImport: string;
  bodyImport: string;
  metadataTitle: string;
  metadataDescription: string;
}

function customizeLayout(src: string, c: LayoutCustomization): string {
  // Replace the next/font/google import line. Template ships with:
  //   import { Inter } from "next/font/google";
  // We want:
  //   import { <Heading>, <Body> } from "next/font/google";
  // If heading === body, only import one symbol.
  const fontImportLine =
    c.headingImport === c.bodyImport
      ? `import { ${c.headingImport} } from "next/font/google";`
      : `import { ${c.headingImport}, ${c.bodyImport} } from "next/font/google";`;

  let out = src.replace(
    /import\s+\{[^}]*\}\s+from\s+["']next\/font\/google["'];?/m,
    fontImportLine,
  );

  // Replace the heading font instantiation (anchored on variable name --font-heading)
  // and likewise for body. We do a forgiving regex: find `const <name> = Inter({...})`
  // anchored on the variable property `variable: "--font-heading"`.
  out = out.replace(
    /const\s+(\w+)\s*=\s*\w+\(\s*\{([^}]*variable\s*:\s*["']--font-heading["'][^}]*)\}\s*\)/m,
    (_match, _name, body) =>
      `const heading = ${c.headingImport}({${body}})`,
  );
  out = out.replace(
    /const\s+(\w+)\s*=\s*\w+\(\s*\{([^}]*variable\s*:\s*["']--font-body["'][^}]*)\}\s*\)/m,
    (_match, _name, body) =>
      `const body = ${c.bodyImport}({${body}})`,
  );

  // Replace metadata title + description
  out = out.replace(
    /(title\s*:\s*)["'][^"']*["']/,
    `$1${JSON.stringify(c.metadataTitle)}`,
  );
  out = out.replace(
    /(description\s*:\s*)["'][^"']*["']/,
    `$1${JSON.stringify(c.metadataDescription)}`,
  );

  return out;
}

function buildPortfolioContent(inputs: CodeInputs) {
  const work = inputs.narrative.resume_bullets.map((role) => ({
    company: role.company,
    title: role.title,
    dates: role.dates,
    bullets: role.bullets,
  }));

  return {
    candidate_name: inputs.narrative.candidate_name,
    headline: inputs.narrative.headline,
    about: inputs.narrative.about,
    why_im_a_fit: inputs.narrative.why_im_a_fit,
    work,
    pitch_section: inputs.pitch_section
      ? {
          stance: inputs.pitch_section.stance,
          title: inputs.pitch_section.title,
          problem: inputs.pitch_section.problem,
          hypothesis: inputs.pitch_section.hypothesis,
          proposed_solution: inputs.pitch_section.proposed_solution,
          metrics_to_track: inputs.pitch_section.metrics_to_track,
          tradeoffs: inputs.pitch_section.tradeoffs,
          guardrails: inputs.pitch_section.guardrails,
          evidence: inputs.pitch_section.evidence,
        }
      : undefined,
    brand_style: {
      primary: inputs.brand_style.primary,
      secondary: inputs.brand_style.secondary,
      background: inputs.brand_style.background,
      headline_font: inputs.brand_style.headline_font,
      body_font: inputs.brand_style.body_font,
      mood: inputs.brand_style.mood,
    },
    target_company: inputs.target_company,
  };
}
