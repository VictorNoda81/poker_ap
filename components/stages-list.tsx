import Link from "next/link";
import { TrophyIcon } from "@/components/brand/icons";
import { formatBRL, formatNumber } from "@/lib/domain/money";
import { formatShortDate, stageName } from "@/lib/domain/stage-name";
import type { StageSummary } from "@/lib/db/queries";

/** Lista de etapas de uma temporada, com os números financeiros de cada uma. */
export function StagesList({ stages }: { stages: StageSummary[] }) {
  if (stages.length === 0) {
    return <p className="card px-4 py-8 text-center text-sm text-chalk-dim">Nenhuma etapa cadastrada.</p>;
  }

  return (
    <div className="card table-scroll">
      <table className="w-full min-w-[46rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-ink-800 text-left text-[0.65rem] uppercase tracking-[0.12em] text-chalk-dim">
            <th scope="col" className="px-3 py-3 font-bold">Etapa</th>
            <th scope="col" className="px-3 py-3 font-bold">Data</th>
            <th scope="col" className="px-3 py-3 text-right font-bold">Jogadores</th>
            <th scope="col" className="px-3 py-3 text-right font-bold">Arrecadação</th>
            <th scope="col" className="px-3 py-3 text-right font-bold">Reserva 10%</th>
            <th scope="col" className="px-3 py-3 text-right font-bold">Prêmios pagos</th>
          </tr>
        </thead>
        <tbody>
          {stages.map((stage) => (
            <tr
              key={stage.id}
              className="border-b border-ink-850/60 transition-colors last:border-0 hover:bg-ink-850/40"
            >
              <td className="px-3 py-3">
                <Link
                  href={`/etapas/${stage.id}`}
                  className="inline-flex items-center gap-2 font-semibold text-chalk transition-colors hover:text-cap-red-light"
                >
                  {stage.isFinal ? <TrophyIcon className="h-4 w-4 text-gold" /> : null}
                  {stageName(stage.number, stage.eventDate, stage.isFinal)}
                </Link>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {stage.status === "scheduled" ? (
                    <Tag tone="neutral">Agendada</Tag>
                  ) : null}
                  {stage.isOctoberCutoff ? <Tag tone="info">Corte da Final</Tag> : null}
                  {stage.missingFinancials > 0 ? (
                    <Tag tone="warn">{stage.missingFinancials} sem financeiro</Tag>
                  ) : null}
                  {stage.needsReviewCount > 0 ? (
                    <Tag tone="warn">{stage.needsReviewCount} a revisar</Tag>
                  ) : null}
                </div>
              </td>
              <td className="tnum px-3 py-3 text-chalk-dim">{formatShortDate(stage.eventDate)}</td>
              <td className="tnum px-3 py-3 text-right text-chalk-dim">
                {stage.participantCount === 0 ? "—" : formatNumber(stage.participantCount)}
              </td>
              <td className="tnum px-3 py-3 text-right font-semibold text-chalk">
                {stage.gross === 0 ? "—" : formatBRL(stage.gross)}
              </td>
              <td className="tnum px-3 py-3 text-right text-gold">
                {stage.reserve === 0 ? "—" : formatBRL(stage.reserve)}
              </td>
              <td className="tnum px-3 py-3 text-right text-chalk-dim">
                {stage.prizesPaid === 0 ? "—" : formatBRL(stage.prizesPaid)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Tag({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "neutral" | "info" | "warn";
}) {
  const toneClass =
    tone === "warn"
      ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
      : tone === "info"
        ? "border-sky-500/30 bg-sky-500/10 text-sky-300"
        : "border-ink-700 bg-ink-850 text-chalk-dim";

  return (
    <span className={`rounded-full border px-2 py-0.5 text-[0.6rem] font-semibold ${toneClass}`}>
      {children}
    </span>
  );
}
