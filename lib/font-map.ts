/**
 * Allowlist of fonts mappable to `next/font/google` imports. Keys are
 * display names (case-insensitive, whitespace-tolerant) returned by
 * BrandSage / Brandfetch; values are the exact `next/font/google` export
 * symbol names.
 *
 * If a font is not in this map, CodeSage falls back to `Inter` to keep
 * the template buildable. The allowlist is intentionally short for MVP;
 * Day 4 polish can extend coverage.
 */
const FONT_MAP: Record<string, string> = {
  inter: "Inter",
  "dm serif display": "DM_Serif_Display",
  "ibm plex sans": "IBM_Plex_Sans",
  "ibm plex serif": "IBM_Plex_Serif",
  "ibm plex mono": "IBM_Plex_Mono",
  roboto: "Roboto",
  "roboto mono": "Roboto_Mono",
  poppins: "Poppins",
  lora: "Lora",
  manrope: "Manrope",
  "plus jakarta sans": "Plus_Jakarta_Sans",
  fraunces: "Fraunces",
  "space grotesk": "Space_Grotesk",
  "space mono": "Space_Mono",
  "work sans": "Work_Sans",
  "nunito sans": "Nunito_Sans",
  nunito: "Nunito",
  montserrat: "Montserrat",
  lato: "Lato",
  "open sans": "Open_Sans",
  raleway: "Raleway",
  "playfair display": "Playfair_Display",
  merriweather: "Merriweather",
  "noto sans": "Noto_Sans",
  "noto serif": "Noto_Serif",
  "source sans 3": "Source_Sans_3",
  "source serif 4": "Source_Serif_4",
};

const FALLBACK = "Inter";

export interface ResolvedFont {
  /** Exact next/font/google import symbol (e.g., "DM_Serif_Display"). */
  importName: string;
  /** The original requested name (preserved for telemetry). */
  requested: string;
  /** Whether this is a fallback (requested font wasn't in the allowlist). */
  fellBack: boolean;
}

export function resolveFont(requested: string | undefined | null): ResolvedFont {
  const raw = (requested ?? "").trim();
  if (!raw) {
    return { importName: FALLBACK, requested: FALLBACK, fellBack: true };
  }
  const key = raw.toLowerCase().replace(/\s+/g, " ");
  const importName = FONT_MAP[key];
  if (!importName) {
    return { importName: FALLBACK, requested: raw, fellBack: true };
  }
  return { importName, requested: raw, fellBack: false };
}

export function isAllowedFont(requested: string): boolean {
  const key = requested.trim().toLowerCase().replace(/\s+/g, " ");
  return key in FONT_MAP;
}
