import Link from "next/link";
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
  const place = row.displayPosition as 1 | 2 | 3;
  const style = PODIUM_STYLE[place];
  // Sem o gasto de todas as etapas, o saldo não é calculável — mostrar um
  // "lucro" só com prêmios seria enganoso.
  const semFinanceiro = row.stagesMissingFinancials > 0 || row.totalPaid === 0;

  return (
    <Link
      href={`/jogadores/${row.player.id}`}
      className={`card group flex items-center gap-3 p-3 transition-transform hover:-translate-y-0.5 ${style.ring}`}
    >
      {/* Medalhão da posição. */}
      <div
        className={`tnum flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-full text-lg font-black leading-none ${style.chip}`}
      >
        {place}
        <span className="text-[0.5rem] font-bold uppercase tracking-wide opacity-80">
          {label(place, inProgress)}
        </span>
      </div>

      {/* Nome + tipo. */}
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold leading-tight text-chalk group-hover:text-cap-red-light">
          {row.player.fullName}
        </p>
        <p className="mt-1 truncate text-[0.7rem] text-chalk-dim">
          {row.stagesPlayed} etapas · {row.wins} {row.wins === 1 ? "vitória" : "vitórias"}
          {semFinanceiro ? "" : ` · ${formatBRLSigned(row.balance)}`}
        </p>
      </div>

      {/* Pontos. */}
      <div className="shrink-0 text-right">
        <span className={`tnum block text-2xl font-black leading-none ${style.accent}`}>
          {formatNumber(row.totalPoints)}
        </span>
        <span className="text-[0.55rem] font-semibold uppercase tracking-[0.14em] text-chalk-dim">
          pontos
        </span>
      </div>
    </Link>
  );
}

/**
 * Destaque do pódio: TODOS que estão em 1º, 2º ou 3º — não só três jogadores.
 * Havendo empate, o pódio cresce (ex.: 1º, 1º, 2º e 3º), porque cortar em três
 * esconderia alguém que está tecnicamente no pódio.
 */
export function Podium({ rows, inProgress }: { rows: RankingRow[]; inProgress: boolean }) {
  const top = rows.filter(
    (row) => row.stagesPlayed > 0 && row.displayPosition >= 1 && row.displayPosition <= 3,
  );
  if (top.length === 0) return null;

  return (
    <section aria-label="Destaques" className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {top.map((row) => (
        <PodiumCard key={row.player.id} row={row} inProgress={inProgress} />
      ))}
    </section>
  );
}
