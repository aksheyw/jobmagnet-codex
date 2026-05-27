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
}

export interface TargetCompany {
  readonly name: string;
  readonly domain: string;
}

export interface PortfolioContent {
  readonly candidate_name: string;
  readonly candidate_contact?: string;
  readonly headline: string;
  readonly about: string;
  readonly why_im_a_fit: WhyFitItem[];
  readonly work: WorkEntry[];
  readonly pitch_section?: PitchSection;
  readonly brand_style: BrandStyle;
  readonly target_company: TargetCompany;
}
