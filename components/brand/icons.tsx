/**
 * Ícones de poker desenhados à mão em SVG.
 *
 * Feitos aqui de propósito: nada de imagem externa ou pacote de ícones com
 * licença duvidosa. Todos herdam a cor via `currentColor` e o tamanho via
 * `className`, então funcionam em qualquer contexto.
 */

type IconProps = {
  className?: string;
  title?: string;
};

function base(className?: string) {
  return className ?? "h-4 w-4";
}

export function SpadeIcon({ className, title }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={base(className)} aria-hidden={!title}>
      {title ? <title>{title}</title> : null}
      <path d="M12 2.2c-1.9 2.6-4.3 4.4-6 6.2-1.6 1.7-2.4 3.2-2.4 4.9 0 2.6 2 4.5 4.4 4.5 1.3 0 2.4-.5 3.2-1.4-.2 2-.9 3.6-2.1 4.9h5.8c-1.2-1.3-1.9-2.9-2.1-4.9.8.9 1.9 1.4 3.2 1.4 2.4 0 4.4-1.9 4.4-4.5 0-1.7-.8-3.2-2.4-4.9-1.7-1.8-4.1-3.6-6-6.2z" />
    </svg>
  );
}

export function HeartIcon({ className, title }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={base(className)} aria-hidden={!title}>
      {title ? <title>{title}</title> : null}
      <path d="M12 21.2c-.3 0-.6-.1-.8-.3C7 17.2 3.2 13.9 3.2 9.9 3.2 6.9 5.5 4.6 8.4 4.6c1.5 0 2.9.7 3.6 1.8.7-1.1 2.1-1.8 3.6-1.8 2.9 0 5.2 2.3 5.2 5.3 0 4-3.8 7.3-8 11-.2.2-.5.3-.8.3z" />
    </svg>
  );
}

export function DiamondIcon({ className, title }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={base(className)} aria-hidden={!title}>
      {title ? <title>{title}</title> : null}
      <path d="M12 2.4 20.4 12 12 21.6 3.6 12 12 2.4z" />
    </svg>
  );
}

export function ClubIcon({ className, title }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={base(className)} aria-hidden={!title}>
      {title ? <title>{title}</title> : null}
      <path d="M12 2.4a4 4 0 0 0-3.3 6.3 4.1 4.1 0 1 0-2 7.6 4 4 0 0 0 4.4-2.2c-.1 2.5-.8 4.4-2.1 5.9h6c-1.3-1.5-2-3.4-2.1-5.9a4 4 0 0 0 4.4 2.2 4.1 4.1 0 1 0-2-7.6A4 4 0 0 0 12 2.4z" />
    </svg>
  );
}

/** Os quatro naipes em linha — usado como ornamento discreto. */
export function SuitsRow({ className }: IconProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className ?? ""}`} aria-hidden="true">
      <SpadeIcon className="h-3 w-3" />
      <HeartIcon className="h-3 w-3 text-cap-red" />
      <ClubIcon className="h-3 w-3" />
      <DiamondIcon className="h-3 w-3 text-cap-red" />
    </span>
  );
}

/** Ficha de poker com estrias na borda. */
export function ChipIcon({ className, title }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" className={base(className)} aria-hidden={!title}>
      {title ? <title>{title}</title> : null}
      <circle cx="24" cy="24" r="22" fill="currentColor" opacity="0.16" />
      <circle cx="24" cy="24" r="22" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="24" cy="24" r="13" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.75" />
      {/* Estrias da borda, a cada 45°. */}
      {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
        <rect
          key={angle}
          x="22.4"
          y="0.6"
          width="3.2"
          height="7.5"
          rx="1.2"
          fill="currentColor"
          transform={`rotate(${angle} 24 24)`}
        />
      ))}
    </svg>
  );
}

/** Troféu do líder do ranking. */
export function TrophyIcon({ className, title }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={base(className)} aria-hidden={!title}>
      {title ? <title>{title}</title> : null}
      <path d="M6 3h12v1.5h3v3a4.5 4.5 0 0 1-4 4.47A6 6 0 0 1 13 15.9V18h3.2c.44 0 .8.36.8.8V21H7v-2.2c0-.44.36-.8.8-.8H11v-2.1a6 6 0 0 1-4-3.93A4.5 4.5 0 0 1 3 7.5v-3h3V3zm0 3H4.5v1.5a3 3 0 0 0 1.9 2.79A9.6 9.6 0 0 1 6 8.4V6zm12 0v2.4c0 .64-.05 1.27-.4 1.89a3 3 0 0 0 1.9-2.79V6H18z" />
    </svg>
  );
}

/** Cartas cruzadas — marca d'água das páginas vazias. */
export function CardsIcon({ className, title }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" className={base(className)} aria-hidden={!title}>
      {title ? <title>{title}</title> : null}
      <rect
        x="7" y="11" width="19" height="27" rx="3"
        fill="none" stroke="currentColor" strokeWidth="2"
        transform="rotate(-14 16.5 24.5)"
      />
      <rect
        x="22" y="11" width="19" height="27" rx="3"
        fill="none" stroke="currentColor" strokeWidth="2"
        transform="rotate(12 31.5 24.5)"
      />
    </svg>
  );
}

/** Medalha numerada do pódio. */
export function MedalIcon({ className, place }: IconProps & { place: 1 | 2 | 3 }) {
  return (
    <svg viewBox="0 0 24 24" className={base(className)} aria-hidden="true">
      <circle cx="12" cy="14.5" r="6.5" fill="currentColor" opacity="0.22" />
      <circle cx="12" cy="14.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 2h3l1.2 5h-2.6L8 2zM16 2h-3l-1.2 5h2.6L16 2z" fill="currentColor" opacity="0.8" />
      <text
        x="12" y="17.6" textAnchor="middle"
        fontSize="7.5" fontWeight="800" fill="currentColor"
      >
        {place}
      </text>
    </svg>
  );
}
