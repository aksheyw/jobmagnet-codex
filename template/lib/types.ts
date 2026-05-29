export interface EvidenceItem {
  readonly type: "screenshot" | "wireframe-svg" | "diagram-svg";
  readonly url: string;
  readonly caption: string;
}

export interface PitchSection {
  readonly stance: "builder" | "analyst" | "customer" | "strategist";
  readonly title: string;
  readonly problem: string;
  readonly hypothesis: string;
  readonly proposed_solution: string;
  readonly metrics_to_track: string[];
  readonly tradeoffs: string[];
  readonly guardrails: string[];
  readonly evidence: EvidenceItem[];
}

export interface WorkEntry {
  readonly company: string;
  readonly title: string;
  readonly dates: string;
  readonly bullets: string[];
}

export interface WhyFitItem {
  readonly bullet: string;
  readonly metric: string;
}

export interface BrandStyle {
  readonly primary: string;
  readonly secondary: string;
  readonly background: string;
  readonly headline_font: string;
  readonly body_font: string;
  readonly mood: "minimal" | "editorial" | "systematic" | "tech-dark" | "warm-creative";
  // Optional in the template (blocker #2). The codex pipeline DOES write
  // `source` into portfolio-content.json (code-agent buildPortfolioContent), and
  // the shared brand-theme twin reads it; keeping the field optional lets the
  // theme file stay byte-identical across app + template and tolerates older
  // fixtures that predate the source-write.
  readonly source?: "brandfetch" | "codex-fallback";
}

export interface TargetCompany {
  readonly name: string;
  readonly domain: string;
}

export interface PortfolioContent {
  readonly candidate_name: string;
  readonly candidate_contact?: string;
  readonly candidate_email?: string;
  readonly headline: string;
  readonly about: string;
  readonly why_im_a_fit: WhyFitItem[];
  readonly work: WorkEntry[];
  readonly pitch_section?: PitchSection;
  readonly brand_style: BrandStyle;
  readonly target_company: TargetCompany;
}
