import Link from "next/link";
import { ChipIcon, MedalIcon, TrophyIcon } from "@/components/brand/icons";
import { PlayerTypeBadge } from "@/components/ui/primitives";
import { formatBRLSigned, formatNumber } from "@/lib/domain/money";
import type { RankingRow } from "@/lib/domain/ranking";

const PODIUM_STYLE = {
  1: {
    ring: "podium-gold",
    text: "text-gold-bright",
    glow: "from-gold/20",
    label: "Campeão",
  },
  2: {
    ring: "podium-silver",
    text: "text-silver",
    glow: "from-silver/15",
    label: "Vice",
  },
  3: {
    ring: "podium-bronze",
    text: "text-bronze",
    glow: "from-bronze/15",
    label: "Terceiro",
  },
} as const;

function PodiumCard({ row }: { row: RankingRow }) {
  const place = row.position as 1 | 2 | 3;
  const style = PODIUM_STYLE[place];

  return (
    <Link
      href={`/jogadores/${row.player.id}`}
      className={`card felt-grain group relative overflow-hidden p-5 transition-transform hover:-translate-y-0.5 ${style.ring}`}
    >
      <div
        className={`pointer-events-none absolute inset-x-0 -top-16 h-32 bg-gradient-to-b ${style.glow} to-transparent blur-2xl`}
      />

      <div className="relative flex items-start justify-between gap-3">
        <span
          className={`inline-flex items-center gap-1.5 text-[0.65rem] font-bold uppercase tracking-[0.18em] ${style.text}`}
        >
          {place === 1 ? (
            <TrophyIcon className="h-4 w-4" title="Líder do ranking" />
          ) : (
            <MedalIcon className="h-4 w-4" place={place} />
          )}
          {style.label}
        </span>
        <span className={`tnum text-3xl font-black leading-none ${style.text} opacity-30`}>
          {place}º
        </span>
      </div>

      <p className="relative mt-3 text-lg font-extrabold leading-tight text-chalk group-hover:text-cap-red-light">
        {row.player.fullName}
      </p>

      <div className="relative mt-2">
        <PlayerTypeBadge
          type={row.player.type}
          memberNumber={row.player.memberNumber}
          invitedByName={row.player.invitedByName}
        />
      </div>

      <div className="relative mt-4 flex items-end justify-between gap-3">
        <div>
          <p className={`tnum text-3xl font-black leading-none ${style.text}`}>
            {formatNumber(row.totalPoints)}
          </p>
          <p className="mt-1 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-chalk-dim">
            pontos
          </p>
        </div>
        <ChipIcon className={`h-9 w-9 opacity-25 ${style.text}`} />
      </div>

      <dl className="relative mt-4 grid grid-cols-3 gap-2 border-t border-white/5 pt-3 text-center">
        <div>
          <dt className="text-[0.6rem] uppercase tracking-wider text-chalk-dim">Etapas</dt>
          <dd className="tnum mt-0.5 text-sm font-bold text-chalk">{row.stagesPlayed}</dd>
        </div>
        <div>
          <dt className="text-[0.6rem] uppercase tracking-wider text-chalk-dim">Vitórias</dt>
          <dd className="tnum mt-0.5 text-sm font-bold text-chalk">{row.wins}</dd>
        </div>
        <div>
          <dt className="text-[0.6rem] uppercase tracking-wider text-chalk-dim">Saldo</dt>
          <dd
            className={`tnum mt-0.5 text-sm font-bold ${
              row.balance > 0
                ? "text-emerald-400"
                : row.balance < 0
                  ? "text-cap-red-light"
                  : "text-chalk-dim"
            }`}
          >
            {row.totalPaid === 0 && row.totalReceived === 0 ? "—" : formatBRLSigned(row.balance)}
          </dd>
        </div>
      </dl>
    </Link>
  );
}

/** Destaque dos três primeiros do ranking. */
export function Podium({ rows }: { rows: RankingRow[] }) {
  const top = rows.filter((row) => row.stagesPlayed > 0).slice(0, 3);
  if (top.length === 0) return null;

  return (
    <section aria-label="Pódio" className="mb-8">
      {/* No celular a ordem é 1-2-3; no desktop o campeão fica no centro, mais alto. */}
      <div className="grid gap-4 sm:grid-cols-3">
        {top.map((row) => (
          <div
            key={row.player.id}
            className={
              row.position === 1
                ? "sm:order-2 sm:-mt-3"
                : row.position === 2
                  ? "sm:order-1 sm:mt-2"
                  : "sm:order-3 sm:mt-2"
            }
          >
            <PodiumCard row={row} />
          </div>
        ))}
      </div>
    </section>
  );
}
