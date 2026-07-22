import Link from "next/link";
import { ChipIcon, TrophyIcon } from "@/components/brand/icons";
import { formatBRL, formatNumber } from "@/lib/domain/money";
import type { FinalPotSplit } from "@/lib/domain/prizes";
import type { RankingRow } from "@/lib/domain/ranking";

/**
 * Onde vai parar o Pote Acumulado (os 10% separados de cada etapa).
 *
 * Existe porque o número sozinho engana: até a temporada 2026 o app mostrava o
 * acumulado como se fosse todo disputado na mesa da Final, quando metade dele
 * premia os líderes do ranking. Aqui as duas metades aparecem lado a lado.
 *
 * Os nomes ao lado de cada colocação são a foto de AGORA — enquanto a temporada
 * corre, quem está em 1º pode não ser quem recebe no fim.
 */
export function FinalPotCard({
  pot,
  ranking,
  rankingSharePct,
  inProgress,
}: {
  pot: FinalPotSplit;
  ranking: RankingRow[];
  rankingSharePct: number;
  inProgress: boolean;
}) {
  if (pot.accumulated <= 0) return null;

  // Quem ocupa cada colocação hoje. Empate = mais de um nome na mesma linha,
  // que é exatamente o que a liga precisa enxergar para decidir o desempate.
  const ocupantes = (place: number): string[] =>
    ranking.filter((r) => r.stagesPlayed > 0 && r.displayPosition === place).map((r) => r.player.fullName);

  return (
    <section className="card mb-8 p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="section-title">Pote Acumulado</h2>
        <p className="tnum text-lg font-extrabold text-gold-bright">{formatBRL(pot.accumulated)}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Mesa da Final */}
        <div className="rounded-lg border border-ink-800 bg-ink-950 p-4">
          <p className="flex items-center gap-2 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-chalk-dim">
            <ChipIcon className="h-4 w-4 text-chalk-dim/40" />
            Etapa Final
          </p>
          <p className="tnum mt-2 text-xl font-extrabold text-gold">{formatBRL(pot.stagePot)}</p>
          <p className="mt-1 text-xs text-chalk-dim">
            {formatNumber(100 - rankingSharePct, 0)}% do acumulado, disputado na mesa
          </p>
        </div>

        {/* Líderes do ranking */}
        <div className="rounded-lg border border-ink-800 bg-ink-950 p-4">
          <p className="flex items-center gap-2 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-chalk-dim">
            <TrophyIcon className="h-4 w-4 text-chalk-dim/40" />
            Líderes do ranking
          </p>
          <p className="tnum mt-2 text-xl font-extrabold text-chalk">
            {formatBRL(pot.rankingShare)}
          </p>
          <p className="mt-1 text-xs text-chalk-dim">
            {formatNumber(rankingSharePct, 0)}% do acumulado, pago pela classificação
          </p>

          <ul className="mt-3 space-y-1.5 border-t border-ink-800 pt-3">
            {pot.byRankingPlace.map((premio) => {
              const nomes = ocupantes(premio.place);
              return (
                <li key={premio.place} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate text-chalk-dim">
                    <strong className="tnum font-bold text-chalk">{premio.place}º</strong>{" "}
                    {nomes.length > 0 ? nomes.join(" · ") : "—"}
                  </span>
                  <span className="tnum shrink-0 font-bold text-chalk">
                    {formatBRL(premio.amount)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {inProgress ? (
        <p className="mt-3 text-xs text-chalk-dim">
          A temporada ainda está em andamento: o pote cresce a cada etapa e os nomes acompanham a{" "}
          <Link href="#classificacao" className="font-semibold text-cap-red-light">
            classificação atual
          </Link>
          .
        </p>
      ) : null}
    </section>
  );
}
