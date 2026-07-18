import Link from "next/link";
import { SuitsRow } from "./brand/icons";

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-ink-800 bg-ink-950">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 text-sm text-chalk-dim sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex flex-col gap-1.5">
          <span className="font-semibold text-chalk">Liga de Poker · Clube Alto dos Pinheiros</span>
          <SuitsRow className="text-chalk-dim/40" />
        </div>
        <Link
          href="/admin"
          className="self-start text-xs font-semibold uppercase tracking-[0.18em] text-chalk-dim/60 transition-colors hover:text-cap-red-light sm:self-auto"
        >
          Área do administrador
        </Link>
      </div>
    </footer>
  );
}
