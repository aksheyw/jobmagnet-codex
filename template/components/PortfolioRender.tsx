import type { PortfolioContent } from "@/lib/types";
import { deriveBrandRoles } from "@/lib/brand-contrast";
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
  const brand = deriveBrandRoles(brand_style);

  const cssVars = {
    "--brand-primary": brand_style.primary,
    "--brand-secondary": brand_style.secondary,
    "--brand-background": brand_style.background,
  } as React.CSSProperties;

  return (
    <div
      style={{
        ...cssVars,
        backgroundColor: brand_style.background,
        minHeight: "100vh",
      }}
    >
      <Hero
        content={{
          candidate_name,
          headline: content.headline,
          target_company,
          brand_style,
        }}
        brand={brand}
      />

      <WhyImAFit
        items={content.why_im_a_fit}
        brandPrimary={brand_style.primary}
        brandInk={brand.ink}
      />

      {content.pitch_section && (
        <PitchSection
          pitch={content.pitch_section}
          companyName={target_company.name}
          brandPrimary={brand_style.primary}
          brandInk={brand.ink}
        />
      )}

      <Work
        entries={content.work}
        brandPrimary={brand_style.primary}
        brandInk={brand.ink}
      />

      <About text={content.about} />

      <footer
        className="px-6 py-5 text-center"
        style={{ backgroundColor: "#0A2540" }}
      >
        <p className="text-sm font-medium text-white">
          {candidate_name}
        </p>
        <p className="mt-1 text-xs text-slate-400">
          {target_company.domain}
        </p>
      </footer>

      <InfoBadge />
    </div>
  );
}
