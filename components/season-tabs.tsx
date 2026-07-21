import Link from "next/link";

/**
 * Seletor de temporada por links (uma de cada vez). Server-friendly: navega por
 * `?temporada=YYYY`, então o estado vive na URL e é compartilhável.
 */
export function SeasonTabs({
  seasons,
  selectedYear,
  basePath,
}: {
  seasons: { year: number; name: string }[];
  selectedYear: number;
  basePath: string;
}) {
  if (seasons.length <= 1) return null;

  return (
    <div className="mb-6 flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-[0.68rem] font-bold uppercase tracking-[0.14em] text-chalk-dim">
        Temporada
      </span>
      {seasons.map((season) => {
        const active = season.year === selectedYear;
        return (
          <Link
            key={season.year}
            href={`${basePath}?temporada=${season.year}`}
            aria-current={active ? "page" : undefined}
            className={`tnum rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
              active
                ? "border-cap-red bg-cap-red/15 text-cap-red-light"
                : "border-ink-700 text-chalk-dim hover:border-ink-600 hover:text-chalk"
            }`}
          >
            {season.year}
          </Link>
        );
      })}
    </div>
  );
}
