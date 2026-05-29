import type { PortfolioContent } from "@/lib/types";
import { deriveTheme } from "@/lib/brand-theme";
import { googleFontLinks } from "@/lib/font-map";
import { Hero } from "./Hero";
import { WhyImAFit } from "./WhyImAFit";
import { About } from "./About";
import { Work } from "./Work";
import { PitchSection } from "./PitchSection";
import { InfoBadge } from "./InfoBadge";

interface PortfolioRenderProps {
  readonly content: PortfolioContent;
}

export function PortfolioRender({ content }: PortfolioRenderProps) {
  const { brand_style, target_company, candidate_name } = content;

  // brand_style is already validated by the codex pipeline before it reaches
  // the static template, so derive the theme directly (no Zod guard needed).
  const theme = deriveTheme(brand_style);
  // Load the brand's actual typeface at render time (allowlisted Google fonts);
  // proprietary faces degrade to the fontStack's generic fallback.
  const fontLinks = googleFontLinks([brand_style.headline_font, brand_style.body_font]);

  return (
    <div
      style={{
        backgroundColor: theme.bg,
        color: theme.fg,
        fontFamily: theme.bodyFamily,
        minHeight: "100vh",
        // Keep dark-mood surfaces when printing / saving to PDF.
        printColorAdjust: "exact",
        WebkitPrintColorAdjust: "exact",
      }}
    >
      {fontLinks.map((href) => (
        <link key={href} rel="stylesheet" href={href} />
      ))}
      <Hero
        theme={theme}
        content={{
          candidate_name,
          candidate_contact: content.candidate_contact,
          candidate_email: content.candidate_email,
          headline: content.headline,
          target_company,
          brand_style,
        }}
      />

      <WhyImAFit theme={theme} items={content.why_im_a_fit} />

      {content.pitch_section && (
        <PitchSection
          theme={theme}
          pitch={content.pitch_section}
          companyName={target_company.name}
        />
      )}

      <Work theme={theme} entries={content.work} />

      <About theme={theme} text={content.about} />

      <footer
        className="px-6 py-6 text-center"
        style={{ backgroundColor: theme.footerBg }}
      >
        <p
          className="text-sm font-semibold"
          style={{ color: theme.onFooter, fontFamily: theme.headingFamily }}
        >
          {candidate_name}
        </p>
        <p className="mt-1 text-xs" style={{ color: theme.onFooterMuted }}>
          {target_company.domain}
        </p>
      </footer>

      <InfoBadge />
    </div>
  );
}
