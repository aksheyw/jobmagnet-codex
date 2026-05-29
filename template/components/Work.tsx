import type { PortfolioContent } from "@/lib/types";

interface WorkProps {
  readonly entries: PortfolioContent["work"];
  readonly brandPrimary: string;
  readonly brandInk: string;
}

export function Work({ entries, brandPrimary, brandInk }: WorkProps) {
  return (
    <section className="bg-white px-6 py-14">
      <div className="mx-auto max-w-4xl">
        <p
          className="mb-2 text-xs font-semibold uppercase tracking-widest"
          style={{ color: brandInk }}
        >
          Selected work
        </p>
        <h2 className="mb-8 text-2xl font-bold tracking-tight text-slate-900 font-heading">
          Where I&apos;ve worked
        </h2>

        <ol className="space-y-8">
          {entries.map((entry) => (
            <li key={`${entry.company}-${entry.dates}`} className="flex flex-col gap-1">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-base font-semibold text-slate-900 font-heading">
                  {entry.company}
                </span>
                <span className="text-slate-400">&middot;</span>
                <span className="text-sm text-slate-700 font-body">{entry.title}</span>
                <span className="ml-auto text-xs text-slate-400 font-body">
                  {entry.dates}
                </span>
              </div>
              <ul className="ml-4 mt-2 space-y-1">
                {entry.bullets.map((bullet, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-2 text-sm leading-relaxed text-slate-600 font-body"
                  >
                    <span
                      className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full"
                      style={{ backgroundColor: brandPrimary }}
                      aria-hidden="true"
                    />
                    {bullet}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
