import Image from "next/image";
import Link from "next/link";
import { SuitsRow } from "./brand/icons";

const NAV = [
  { href: "/", label: "Ranking" },
  { href: "/temporadas", label: "Temporadas" },
  { href: "/etapas", label: "Etapas" },
  { href: "/jogadores", label: "Jogadores" },
];

/**
 * Cabeçalho do site.
 *
 * A faixa do logo é CLARA porque a marca do clube tem tipografia preta — sobre
 * fundo escuro ela sumiria. Abaixo dela começa o escuro do resto do app.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40">
      {/* Filete vermelho da marca. */}
      <div className="h-1 bg-gradient-to-r from-cap-red-dark via-cap-red to-cap-red-dark" />

      <div className="border-b border-black/10 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-3 sm:gap-4" aria-label="Início">
            <Image
              src="/logo-cap.png"
              alt="Clube Alto dos Pinheiros"
              width={853}
              height={190}
              priority
              className="h-7 w-auto sm:h-9"
            />
            <span className="hidden h-8 w-px bg-black/15 sm:block" />
            <span className="hidden flex-col leading-none sm:flex">
              <span className="text-[0.65rem] font-bold uppercase tracking-[0.22em] text-cap-red">
                Liga de Poker
              </span>
              <span className="mt-1 text-[0.6rem] font-medium uppercase tracking-[0.18em] text-black/45">
                Ranking Oficial
              </span>
            </span>
          </Link>

          <nav aria-label="Navegação principal">
            <ul className="flex items-center gap-1 text-sm font-semibold">
              {NAV.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="rounded-md px-2.5 py-1.5 text-black/70 transition-colors hover:bg-black/5 hover:text-cap-red sm:px-3"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>

      {/* Faixa escura de transição, com os naipes como ornamento. */}
      <div className="border-b border-white/5 bg-ink-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-1.5 sm:px-6">
          <SuitsRow className="text-chalk-dim/50" />
          <span className="text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-chalk-dim/60">
            Clube Alto dos Pinheiros
          </span>
        </div>
      </div>
    </header>
  );
}
