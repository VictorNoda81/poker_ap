import Link from "next/link";
import { notFound } from "next/navigation";
import { MedalIcon, TrophyIcon } from "@/components/brand/icons";
import {
  BackLink,
  EmptyState,
  ErrorNotice,
  PageHeading,
  PlayerTypeBadge,
  SetupNotice,
  StatCard,
} from "@/components/ui/primitives";
import { getStageDetail } from "@/lib/db/queries";
import { load } from "@/lib/db/load";
import { formatBRL, formatNumber } from "@/lib/domain/money";
import { validatePrizeDistribution } from "@/lib/domain/prizes";
import { formatLongDate, stageName } from "@/lib/domain/stage-name";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params) {
  const { id } = await params;
  const result = await load(() => getStageDetail(id));
  if (result.status !== "ok" || !result.data) return { title: "Etapa" };
  const { stage } = result.data;
  return { title: stageName(stage.number, stage.eventDate, stage.isFinal) };
}

function placementClass(placement: number | null): string {
  if (placement === 1) return "text-gold-bright";
  if (placement === 2) return "text-silver";
  if (placement === 3) return "text-bronze";
  return "text-chalk-dim";
}

export default async function EtapaPage({ params }: Params) {
  const { id } = await params;
  const result = await load(() => getStageDetail(id));

  if (result.status === "unconfigured") return <SetupNotice />;
  if (result.status === "error") return <ErrorNotice message={result.message} />;
  if (!result.data) notFound();

  const { stage, season, entries } = result.data;
  const nome = stageName(stage.number, stage.eventDate, stage.isFinal);

  // Confere se prêmios + reserva batem com a arrecadação — mesma validação
  // que o admin vê ao lançar a etapa.
  const check = validatePrizeDistribution(
    stage.gross,
    stage.reserve,
    entries.map((e) => e.prizeAmount),
  );
  const temPremiacao = stage.prizesPaid > 0;

  return (
    <>
      <div className="mb-4">
        <BackLink href={`/temporadas/${season.year}`}>{season.name}</BackLink>
      </div>

      <PageHeading
        eyebrow={season.name}
        title={nome}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {formatLongDate(stage.eventDate)}
            {stage.isFinal ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wider text-gold">
                <TrophyIcon className="h-3 w-3" /> Etapa Final
              </span>
            ) : null}
            {stage.status === "scheduled" ? (
              <span className="rounded-full border border-ink-700 bg-ink-850 px-2 py-0.5 text-[0.65rem] font-semibold text-chalk-dim">
                Ainda não realizada
              </span>
            ) : null}
          </span>
        }
      />

      <section className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Participantes"
          value={entries.length === 0 ? "—" : formatNumber(entries.length)}
        />
        <StatCard
          label="Arrecadação"
          value={stage.gross === 0 ? "—" : formatBRL(stage.gross)}
          hint={
            stage.grossIsManual
              ? "Total informado manualmente"
              : "Soma do que os jogadores gastaram"
          }
        />
        <StatCard
          label={stage.isFinal ? "Sem nova reserva" : "Reserva da Etapa Final"}
          value={stage.isFinal ? "—" : formatBRL(stage.reserve)}
          hint={stage.isFinal ? "A Final distribui o acumulado" : undefined}
          tone="gold"
        />
        <StatCard
          label="Prêmios pagos"
          value={temPremiacao ? formatBRL(stage.prizesPaid) : "—"}
          hint={temPremiacao ? undefined : "Ainda não lançados"}
        />
      </section>

      {/* Aviso de conferência — só faz sentido se já houver premiação lançada. */}
      {temPremiacao && !check.balanced ? (
        <div className="card mb-6 border-amber-500/30 bg-amber-500/5 p-4">
          <p className="text-sm font-semibold text-amber-300">Conferência da premiação</p>
          <p className="mt-1 text-sm text-chalk-dim">
            {check.message} Diferença de{" "}
            <strong className="tnum text-chalk">{formatBRL(Math.abs(check.difference))}</strong>{" "}
            entre a arrecadação e a soma de prêmios pagos com a reserva.
          </p>
        </div>
      ) : null}

      {stage.missingFinancials > 0 ? (
        <div className="card mb-6 border-ink-700 bg-ink-900 p-4">
          <p className="text-sm text-chalk-dim">
            <strong className="text-chalk">{stage.missingFinancials}</strong> participantes desta
            etapa ainda não têm o valor gasto lançado. Os dados vieram da planilha histórica, que
            registrava apenas o total do pote.
          </p>
        </div>
      ) : null}

      <div className="section-title mb-4">Resultado</div>

      {entries.length === 0 ? (
        <EmptyState
          title="Resultado ainda não lançado"
          description="Assim que o administrador lançar os participantes e as colocações, o resultado aparece aqui."
        />
      ) : (
        <div className="card table-scroll">
          <table className="w-full min-w-[44rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-ink-800 text-left text-[0.65rem] uppercase tracking-[0.12em] text-chalk-dim">
                <th scope="col" className="px-3 py-3 font-bold">Col.</th>
                <th scope="col" className="px-3 py-3 font-bold">Jogador</th>
                <th scope="col" className="px-3 py-3 text-right font-bold">Pontos</th>
                <th scope="col" className="px-3 py-3 text-right font-bold">Pago</th>
                <th scope="col" className="px-3 py-3 text-right font-bold">Prêmio</th>
                <th scope="col" className="px-3 py-3 text-right font-bold">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const saldo =
                  entry.amountPaid === null ? null : entry.prizeAmount - entry.amountPaid;
                return (
                  <tr
                    key={entry.player.id}
                    className="border-b border-ink-850/60 transition-colors last:border-0 hover:bg-ink-850/40"
                  >
                    <td className="px-3 py-3">
                      <span
                        className={`tnum inline-flex items-center gap-1.5 text-base font-black ${placementClass(entry.placement)}`}
                      >
                        {entry.placement !== null && entry.placement <= 3 ? (
                          <MedalIcon className="h-4 w-4" place={entry.placement as 1 | 2 | 3} />
                        ) : null}
                        {entry.placement === null ? "16º+" : `${entry.placement}º`}
                      </span>
                    </td>

                    <td className="px-3 py-3">
                      <Link
                        href={`/jogadores/${entry.player.id}`}
                        className="font-semibold text-chalk transition-colors hover:text-cap-red-light"
                      >
                        {entry.player.fullName}
                      </Link>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <PlayerTypeBadge
                          type={entry.player.type}
                          memberNumber={entry.player.memberNumber}
                          invitedByName={entry.player.invitedByName}
                        />
                        {entry.needsReview ? (
                          <span
                            title={entry.reviewNote ?? undefined}
                            className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[0.6rem] font-semibold text-amber-300"
                          >
                            revisar
                          </span>
                        ) : null}
                      </div>
                    </td>

                    <td className="tnum px-3 py-3 text-right text-base font-bold text-chalk">
                      {formatNumber(entry.points)}
                    </td>
                    <td className="tnum px-3 py-3 text-right text-chalk-dim">
                      {entry.amountPaid === null ? "—" : formatBRL(entry.amountPaid)}
                    </td>
                    <td
                      className={`tnum px-3 py-3 text-right ${
                        entry.prizeAmount > 0 ? "font-bold text-gold" : "text-chalk-dim"
                      }`}
                    >
                      {entry.prizeAmount > 0 ? formatBRL(entry.prizeAmount) : "—"}
                    </td>
                    <td
                      className={`tnum px-3 py-3 text-right font-semibold ${
                        saldo === null
                          ? "text-chalk-dim"
                          : saldo > 0
                            ? "text-emerald-400"
                            : saldo < 0
                              ? "text-cap-red-light"
                              : "text-chalk-dim"
                      }`}
                    >
                      {saldo === null ? "—" : formatBRL(saldo)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs leading-relaxed text-chalk-dim">
        Jogadores marcados como <strong className="text-chalk-dim/90">16º+</strong> terminaram na
        faixa de 16º lugar ou pior, que pontua igual independentemente da posição exata.
      </p>
    </>
  );
}
