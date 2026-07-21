import Link from "next/link";
import { PlayerTypeBadge } from "@/components/ui/primitives";
import { formatBRLSigned, formatNumber } from "@/lib/domain/money";
import type { RankingRow } from "@/lib/domain/ranking";

const PODIUM_STYLE = {
  1: { accent: "text-gold-bright", ring: "podium-gold", chip: "bg-gold/15 text-gold-bright" },
  2: { accent: "text-silver", ring: "podium-silver", chip: "bg-silver/15 text-silver" },
  3: { accent: "text-bronze", ring: "podium-bronze", chip: "bg-bronze/15 text-bronze" },
} as const;

/** Rótulo do 1º lugar: "Líder" enquanto a temporada corre; "Campeão" quando fecha. */
function firstPlaceLabel(inProgress: boolean): string {
  return inProgress ? "Líder" : "Campeão";
}

function label(place: 1 | 2 | 3, inProgress: boolean): string {
  if (place === 1) return firstPlaceLabel(inProgress);
  return place === 2 ? "Vice" : "3º lugar";
}

function PodiumCard({ row, inProgress }: { row: RankingRow; inProgress: boolean }) {
  const place = row.position as 1 | 2 | 3;
  const style = PODIUM_STYLE[place];
  const semFinanceiro = row.totalPaid === 0 && row.totalReceived === 0;

  return (
    <Link
      href={`/jogadores/${row.player.id}`}
      className={`card group flex flex-col p-4 transition-transform hover:-translate-y-0.5 ${style.ring}`}
    >
      {/* Etiqueta de posição — só texto, sem ornamentos. */}
      <div className="flex items-center justify-between">
        <span
          className={`rounded-full px-2.5 py-1 text-[0.62rem] font-bold uppercase tracking-[0.14em] ${style.chip}`}
        >
          {label(place, inProgress)}
        </span>
        <span className={`tnum text-2xl font-black leading-none ${style.accent}`}>{place}º</span>
      </div>

      <p className="mt-3 text-lg font-extrabold leading-tight text-chalk group-hover:text-cap-red-light">
        {row.player.fullName}
      </p>
      <div className="mt-1.5">
        <PlayerTypeBadge
          type={row.player.type}
          memberNumber={row.player.memberNumber}
          invitedByName={row.player.invitedByName}
        />
      </div>

      {/* Pontuação em destaque. */}
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className={`tnum text-3xl font-black leading-none ${style.accent}`}>
          {formatNumber(row.totalPoints)}
        </span>
        <span className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-chalk-dim">
          pontos
        </span>
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-white/5 pt-3 text-center">
        <div>
          <dt className="text-[0.58rem] uppercase tracking-wider text-chalk-dim">Etapas</dt>
          <dd className="tnum mt-0.5 text-sm font-bold text-chalk">{row.stagesPlayed}</dd>
        </div>
        <div>
          <dt className="text-[0.58rem] uppercase tracking-wider text-chalk-dim">Vitórias</dt>
          <dd className="tnum mt-0.5 text-sm font-bold text-chalk">{row.wins}</dd>
        </div>
        <div>
          <dt className="text-[0.58rem] uppercase tracking-wider text-chalk-dim">Saldo</dt>
          <dd
            className={`tnum mt-0.5 text-sm font-bold ${
              semFinanceiro
                ? "text-chalk-dim"
                : row.balance > 0
                  ? "text-emerald-400"
                  : row.balance < 0
                    ? "text-cap-red-light"
                    : "text-chalk-dim"
            }`}
          >
            {semFinanceiro ? "—" : formatBRLSigned(row.balance)}
          </dd>
        </div>
      </dl>
    </Link>
  );
}

/**
 * Destaque dos três primeiros do ranking, em cards iguais (1-2-3 da esquerda
 * para a direita, sem o efeito de pódio escalonado que confundia a leitura).
 */
export function Podium({ rows, inProgress }: { rows: RankingRow[]; inProgress: boolean }) {
  const top = rows.filter((row) => row.stagesPlayed > 0).slice(0, 3);
  if (top.length === 0) return null;

  return (
    <section aria-label="Destaques" className="mb-8 grid gap-3 sm:grid-cols-3">
      {top.map((row) => (
        <PodiumCard key={row.player.id} row={row} inProgress={inProgress} />
      ))}
    </section>
  );
}
