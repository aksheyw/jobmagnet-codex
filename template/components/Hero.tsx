import type { PortfolioContent } from "@/lib/types";

interface HeroProps {
  readonly content: Pick<PortfolioContent, "candidate_name" | "headline" | "target_company" | "brand_style">;
}

export function Hero({ content }: HeroProps) {
  const { candidate_name, headline, target_company, brand_style } = content;

  const initials = candidate_name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const mailtoHref = `mailto:?subject=${encodeURIComponent(`Let's connect — ${candidate_name}`)}`;

  return (
    <section
      className="py-16 px-6 text-center"
      style={{
        background: `linear-gradient(180deg, ${brand_style.background} 0%, color-mix(in srgb, ${brand_style.primary} 4%, white) 100%)`,
      }}
    >
      <div
        className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full text-2xl font-bold text-white"
        style={{
          background: `linear-gradient(135deg, ${brand_style.primary}, ${brand_style.secondary})`,
        }}
        aria-hidden="true"
      >
        {initials}
      </div>

      <h1
        className="mb-2 text-4xl font-bold tracking-tight text-slate-900 font-heading"
        style={{ letterSpacing: "-0.5px" }}
      >
        {candidate_name}
      </h1>

      <p className="mx-auto max-w-xl text-lg leading-relaxed text-slate-600 font-body">
        {headline.replace(
          target_company.name,
          `<mark>${target_company.name}</mark>`
        ).split(/<mark>|<\/mark>/).map((part, i) =>
          i % 2 === 1 ? (
            <strong key={i} style={{ color: brand_style.primary }}>
              {part}
            </strong>
          ) : (
            <span key={i}>{part}</span>
          )
        )}
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <a
          href={mailtoHref}
          className="inline-flex items-center rounded-md px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: brand_style.primary }}
        >
          Schedule a call &rarr;
        </a>
        <a
          href={mailtoHref}
          className="inline-flex items-center rounded-md border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50"
        >
          Get in touch
        </a>
      </div>
    </section>
  );
}
