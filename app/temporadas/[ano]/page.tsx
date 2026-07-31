import { notFound } from "next/navigation";
import { TrophyIcon } from "@/components/brand/icons";
import { FinalPotCard } from "@/components/final-pot-card";
import { Podium } from "@/components/ranking/podium";
import { RankingShare } from "@/components/ranking/ranking-share";
import { RankingTable } from "@/components/ranking/ranking-table";
import { StagesList } from "@/components/stages-list";
import {
  BackLink,
  EmptyState,
  ErrorNotice,
  PageHeading,
  SetupNotice,
  StatCard,
} from "@/components/ui/primitives";
import { getAppSettings, getSeasonBundle, getSeasonByYear } from "@/lib/db/queries";
import { load } from "@/lib/db/load";
import { formatBRL, formatNumber } from "@/lib/domain/money";
import { stageName } from "@/lib/domain/stage-name";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ ano: string }> };

export async function generateMetadata({ params }: Params) {
  const { ano } = await params;
  return { title: `Temporada ${ano}` };
}

export default async function TemporadaPage({ params }: Params) {
  const { ano } = await params;
  const year = Number(ano);
  if (!Number.isInteger(year)) notFound();

  const result = await load(async () => {
    const season = await getSeasonByYear(year);
    if (!season) return null;
    const [bundle, appSettings] = await Promise.all([getSeasonBundle(season), getAppSettings()]);
    return { ...bundle, appSettings };
  });

  if (result.status === "unconfigured") return <SetupNotice />;
  if (result.status === "error") return <ErrorNotice message={result.message} />;
  if (!result.data) notFound();

  const {
    season,
    ranking,
    stages,
    entries,
    accumulatedReserve,
    finalPot,
    totals,
    settings,
    appSettings,
  } = result.data;
  const realizadas = stages.filter((s) => s.status === "completed");

  // Colunas de pontos por etapa (só as realizadas) para o fim da tabela e do PDF.
  const stageColumns = realizadas.map((s) => ({
    id: s.id,
    number: s.number,
    isFinal: s.isFinal,
    name: stageName(s.number, s.eventDate, s.isFinal),
  }));
  const pointsByStage: Record<string, Record<string, number>> = {};
  for (const e of entries) {
    (pointsByStage[e.playerId] ??= {})[e.stageId] = e.points;
  }
  const jogadoresAtivos = ranking.filter((r) => r.stagesPlayed > 0).length;
  const final = stages.find((s) => s.isFinal);
  const inProgress = stages.some((s) => s.status === "scheduled");

  return (
    <>
      <div className="mb-4">
        <BackLink href="/temporadas">Todas as temporadas</BackLink>
      </div>

      <PageHeading
        eyebrow={season.is_current ? "Temporada em andamento" : "Temporada encerrada"}
        title={season.name}
        subtitle={`${realizadas.length} de ${stages.length} etapas · ${formatNumber(jogadoresAtivos)} jogadores participaram`}
      />

      <section className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Participações" value={formatNumber(totals.participations)} />
        <StatCard label="Arrecadação total" value={formatBRL(totals.gross)} />
        <StatCard
          label={final ? "Pote Acumulado distribuído" : "Pote Acumulado"}
          value={formatBRL(accumulatedReserve)}
          hint={`${formatNumber(settings.finalReservePct, 0)}% de cada etapa`}
          tone="gold"
          icon={<TrophyIcon className="h-5 w-5" />}
        />
        <StatCard label="Prêmios pagos" value={formatBRL(totals.prizesPaid)} />
      </section>

      {jogadoresAtivos === 0 ? (
        <EmptyState
          title="Nenhum resultado nesta temporada"
          description="As etapas ainda não tiveram resultados lançados."
        />
      ) : (
        <>
          <Podium
            rows={ranking}
            inProgress={inProgress}
            showFinances={appSettings.showPlayerFinances}
          />
          <FinalPotCard
            pot={finalPot}
            ranking={ranking}
            rankingSharePct={settings.rankingSharePct}
            inProgress={inProgress}
          />
          <div id="classificacao" className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <span className="section-title">Classificação da temporada</span>
            <RankingShare
              title={season.name}
              subtitle={`${realizadas.length} ${realizadas.length === 1 ? "etapa disputada" : "etapas disputadas"}${inProgress ? " · parcial" : ""}`}
              stageColumns={stageColumns}
              pointsByStage={pointsByStage}
              rows={ranking.map((r) => ({
                playerId: r.player.id,
                position: r.displayPosition,
                name: r.player.fullName,
                type: r.player.type,
                points: r.totalPoints,
                stagesPlayed: r.stagesPlayed,
                averagePoints: r.averagePoints,
                averagePlacement: r.averagePlacement,
                wins: r.wins,
                seconds: r.seconds,
                thirds: r.thirds,
                bestPlacement: r.bestPlacement,
                bestPlacementCount: r.bestPlacementCount,
                totalRebuys: r.totalRebuys,
                totalAddons: r.totalAddons,
                averageRebuys: r.averageRebuys,
                stagesMissingExtras: r.stagesMissingExtras,
                totalReceived: r.totalReceived,
                totalPaid: r.totalPaid,
                balance: r.balance,
                stagesMissingFinancials: r.stagesMissingFinancials,
              }))}
            />
          </div>
          <RankingTable
            rows={ranking}
            showFinancials={appSettings.showPlayerFinances}
            stageColumns={stageColumns}
            pointsByStage={pointsByStage}
          />
        </>
      )}

      <div className="section-title mb-4 mt-10">Etapas</div>
      <StagesList stages={stages} />
    </>
  );
}
