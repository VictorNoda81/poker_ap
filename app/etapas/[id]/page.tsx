import { notFound } from "next/navigation";
import { TrophyIcon } from "@/components/brand/icons";
import {
  BackLink,
  EmptyState,
  ErrorNotice,
  PageHeading,
  SetupNotice,
  StatCard,
} from "@/components/ui/primitives";
import { getAppSettings, getStageDetail } from "@/lib/db/queries";
import { load } from "@/lib/db/load";
import { formatBRL, formatNumber } from "@/lib/domain/money";
import { StageResultsTable } from "@/components/stage-results-table";
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

export default async function EtapaPage({ params }: Params) {
  const { id } = await params;
  const result = await load(async () => {
    const [detail, appSettings] = await Promise.all([getStageDetail(id), getAppSettings()]);
    return detail ? { ...detail, appSettings } : null;
  });

  if (result.status === "unconfigured") return <SetupNotice />;
  if (result.status === "error") return <ErrorNotice message={result.message} />;
  if (!result.data) notFound();

  const { stage, season, entries, appSettings } = result.data;
  const nome = stageName(stage.number, stage.eventDate, stage.isFinal);

  // Confere se prêmios + reserva batem com a arrecadação — mesma validação
  // que o admin vê ao lançar a etapa.
  const check = validatePrizeDistribution(
    stage.gross,
    stage.deductions,
    stage.reserve,
    entries.map((e) => e.prizeAmount),
  );
  // O aviso de conferência só cabe quando há prêmio LANÇADO por jogador; o
  // valor estimado (arrecadação − reserva) fecha por construção.
  const temPremiacaoLancada = stage.prizesRecorded > 0;

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

      <section className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-5">
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
          label="Custos deduzidos"
          value={stage.deductions === 0 ? "—" : formatBRL(stage.deductions)}
          hint={
            stage.deductions === 0
              ? undefined
              : `Adm. ${formatBRL(stage.adminFeeTotal)}${
                  stage.otherCosts > 0 ? ` · outros ${formatBRL(stage.otherCosts)}` : ""
                }`
          }
        />
        <StatCard
          label={stage.isFinal ? "Sem nova reserva" : "Reserva Etapa Final"}
          value={stage.isFinal ? "—" : formatBRL(stage.reserve)}
          hint={stage.isFinal ? "A Final distribui o acumulado" : "10% após as deduções"}
          tone="gold"
        />
        <StatCard
          label="Prêmios pagos"
          value={stage.prizesPaid > 0 ? formatBRL(stage.prizesPaid) : "—"}
          hint={
            stage.prizesEstimated
              ? "Arrecadação menos a reserva"
              : stage.prizesPaid > 0
                ? undefined
                : "Ainda não lançados"
          }
        />
      </section>

      {/* Aviso de conferência — só faz sentido se já houver premiação lançada. */}
      {temPremiacaoLancada && !check.balanced ? (
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
            O financeiro por jogador (quanto cada um gastou e recebeu) passa a ser registrado a
            partir das próximas etapas. Das anteriores, a liga guardava apenas o total do pote —
            por isso as colunas <strong className="text-chalk">Pago</strong> e{" "}
            <strong className="text-chalk">Prêmio</strong> aparecem vazias aqui.{" "}
            <strong className="text-chalk">Re-buys</strong> e{" "}
            <strong className="text-chalk">Add-on</strong> aparecem como zero: a liga só passou a
            anotá-los por jogador a partir da Etapa 7 de 2026.
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
        <StageResultsTable
          rows={entries.map((e) => ({
            playerId: e.player.id,
            fullName: e.player.fullName,
            type: e.player.type,
            memberNumber: e.player.memberNumber,
            invitedByName: e.player.invitedByName,
            displayPlacement: e.displayPlacement,
            points: e.points,
            rebuys: e.rebuys,
            hadAddon: e.hadAddon,
            amountPaid: e.amountPaid,
            prizeAmount: e.prizeAmount,
            needsReview: e.needsReview,
            reviewNote: e.reviewNote,
          }))}
          showFinances={appSettings.showPlayerFinances}
        />
      )}

      <p className="mt-4 text-xs leading-relaxed text-chalk-dim">
        A colocação vem da pontuação da etapa: quem empatou em pontos divide a mesma colocação.
        Da 16ª posição em diante todos pontuam igual, então aparecem empatados.
      </p>
    </>
  );
}
