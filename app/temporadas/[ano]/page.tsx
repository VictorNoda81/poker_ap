import { notFound } from "next/navigation";
import { TrophyIcon } from "@/components/brand/icons";
import { Podium } from "@/components/ranking/podium";
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
import { getSeasonBundle, getSeasonByYear } from "@/lib/db/queries";
import { load } from "@/lib/db/load";
import { formatBRL, formatNumber } from "@/lib/domain/money";

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
    return getSeasonBundle(season);
  });

  if (result.status === "unconfigured") return <SetupNotice />;
  if (result.status === "error") return <ErrorNotice message={result.message} />;
  if (!result.data) notFound();

  const { season, ranking, stages, accumulatedReserve, totals, settings } = result.data;
  const realizadas = stages.filter((s) => s.status === "completed");
  const jogadoresAtivos = ranking.filter((r) => r.stagesPlayed > 0).length;
  const final = stages.find((s) => s.isFinal);

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
          label={final ? "Pote distribuído na Final" : "Pote da Etapa Final"}
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
          <Podium rows={ranking} />
          <div className="section-title mb-4">Classificação da temporada</div>
          <RankingTable rows={ranking} />
        </>
      )}

      <div className="section-title mb-4 mt-10">Etapas</div>
      <StagesList stages={stages} />
    </>
  );
}
