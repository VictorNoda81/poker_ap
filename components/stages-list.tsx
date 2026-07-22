import Link from "next/link";
import { TrophyIcon } from "@/components/brand/icons";
import { formatBRL, formatNumber } from "@/lib/domain/money";
import { formatShortDate, stageName } from "@/lib/domain/stage-name";
import type { StageSummary } from "@/lib/db/queries";

/**
 * Lista de etapas de uma temporada.
 *
 * As larguras vêm de um `colgroup` fixo para que as tabelas de temporadas
 * diferentes fiquem alinhadas entre si, mesmo com conteúdos de tamanhos
 * diferentes (antes, a de 2025 saía fora de linha).
 */
export function StagesList({ stages }: { stages: StageSummary[] }) {
  if (stages.length === 0) {
    return (
      <p className="card px-4 py-8 text-center text-sm text-chalk-dim">Nenhuma etapa cadastrada.</p>
    );
  }

  return (
    <div className="card table-scroll">
      <table className="w-full min-w-[46rem] table-fixed border-collapse text-sm">
        <colgroup>
          <col className="w-[13rem]" />
          <col className="w-[6rem]" />
          <col className="w-[5.5rem]" />
          <col className="w-[7.5rem]" />
          <col className="w-[8rem]" />
          <col className="w-[7.5rem]" />
        </colgroup>

        <thead>
          <tr className="border-b border-ink-800 text-left text-[0.65rem] uppercase tracking-[0.1em] text-chalk-dim">
            <th scope="col" className="px-2 py-2.5 font-bold">Etapa</th>
            <th scope="col" className="px-2 py-2.5 font-bold">Data</th>
            <th scope="col" className="px-2 py-2.5 text-right font-bold">Jogadores</th>
            <th scope="col" className="px-2 py-2.5 text-right font-bold">Arrecadação</th>
            <th scope="col" className="px-2 py-2.5 text-right font-bold">Reserva Etapa Final</th>
            <th scope="col" className="px-2 py-2.5 text-right font-bold">Prêmios pagos</th>
          </tr>
        </thead>
        <tbody>
          {stages.map((stage) => (
            <tr
              key={stage.id}
              className="border-b border-ink-850/60 transition-colors last:border-0 hover:bg-ink-850/40"
            >
              <td className="px-2 py-2.5">
                <Link
                  href={`/etapas/${stage.id}`}
                  className="inline-flex items-center gap-1.5 font-semibold text-chalk transition-colors hover:text-cap-red-light"
                >
                  {stage.isFinal ? (
                    <TrophyIcon className="h-4 w-4 shrink-0 text-gold" />
                  ) : null}
                  <span className="truncate">
                    {stageName(stage.number, stage.eventDate, stage.isFinal)}
                  </span>
                </Link>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {stage.status === "scheduled" ? <Tag tone="neutral">Agendada</Tag> : null}
                  {stage.isOctoberCutoff ? <Tag tone="info">Corte da Final</Tag> : null}
                  {stage.needsReviewCount > 0 ? (
                    <Tag tone="warn">{stage.needsReviewCount} a revisar</Tag>
                  ) : null}
                </div>
              </td>
              <td className="tnum px-2 py-2.5 text-chalk-dim">{formatShortDate(stage.eventDate)}</td>
              <td className="tnum px-2 py-2.5 text-right text-chalk-dim">
                {stage.participantCount === 0 ? "—" : formatNumber(stage.participantCount)}
              </td>
              <td className="tnum px-2 py-2.5 text-right font-semibold text-chalk">
                {stage.gross === 0 ? "—" : formatBRL(stage.gross)}
              </td>
              <td className="tnum px-2 py-2.5 text-right text-gold">
                {stage.reserve === 0 ? "—" : formatBRL(stage.reserve)}
              </td>
              <td className="tnum px-2 py-2.5 text-right text-chalk-dim">
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
