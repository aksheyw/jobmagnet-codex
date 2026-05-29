import type { PortfolioContent } from "@/lib/types";

interface WhyImAFitProps {
  readonly items: PortfolioContent["why_im_a_fit"];
  readonly brandPrimary: string;
  readonly brandInk: string;
}

export function WhyImAFit({ items, brandPrimary, brandInk }: WhyImAFitProps) {
  return (
    <section className="bg-white px-6 py-14">
      <div className="mx-auto max-w-4xl">
        <p
          className="mb-2 text-xs font-semibold uppercase tracking-widest"
          style={{ color: brandInk }}
        >
          Why I&apos;m a fit
        </p>
        <h2 className="mb-8 text-2xl font-bold tracking-tight text-slate-900 font-heading">
          Built for this role, not just any role.
        </h2>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <div
              key={item.metric}
              className="pl-4"
              style={{ borderLeft: `2px solid ${brandPrimary}` }}
            >
              <p className="mb-1 text-sm font-semibold text-slate-900 font-heading">
                {item.metric}
              </p>
              <p className="text-sm leading-relaxed text-slate-600 font-body">
                {item.bullet}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
