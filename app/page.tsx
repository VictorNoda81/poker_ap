import Link from "next/link";
import { ChipIcon, TrophyIcon } from "@/components/brand/icons";
import { FinalPotCard } from "@/components/final-pot-card";
import { RankingImage } from "@/components/ranking/ranking-image";
import { Podium } from "@/components/ranking/podium";
import { RankingTable } from "@/components/ranking/ranking-table";
import { SeasonTabs } from "@/components/season-tabs";
import {
  EmptyState,
  ErrorNotice,
  PageHeading,
  SetupNotice,
  StatCard,
} from "@/components/ui/primitives";
import { getAppSettings, getCurrentSeason, getSeasonBundle, listSeasons } from "@/lib/db/queries";
import { load } from "@/lib/db/load";
import { formatBRL, formatNumber } from "@/lib/domain/money";
import { formatShortDate, stageName } from "@/lib/domain/stage-name";

// O ranking muda a cada lançamento do admin — sempre renderiza na hora.
export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ temporada?: string }>;
}) {
  const { temporada } = await searchParams;
  const anoPedido = Number(temporada);

  const result = await load(async () => {
    const seasons = await listSeasons();
    if (seasons.length === 0) return null;
    // A temporada da URL, senão a atual, senão a mais recente.
    const season =
      seasons.find((s) => s.year === anoPedido) ?? (await getCurrentSeason()) ?? seasons[0];
    const [bundle, appSettings] = await Promise.all([getSeasonBundle(season), getAppSettings()]);
    return { seasons, bundle, appSettings };
  });

  if (result.status === "unconfigured") return <SetupNotice />;
  if (result.status === "error") return <ErrorNotice message={result.message} />;

  if (!result.data) {
    return (
      <EmptyState
        title="Nenhuma temporada cadastrada"
        description="Crie a primeira temporada no painel de administração ou rode o seed para importar a temporada 2026."
      />
    );
  }

  const { seasons, bundle, appSettings } = result.data;
  const { season, ranking, stages, accumulatedReserve, finalPot, totals, settings } = bundle;
  const realizadas = stages.filter((s) => s.status === "completed");
  const proxima = stages.find((s) => s.status === "scheduled");
  const jogadoresAtivos = ranking.filter((r) => r.stagesPlayed > 0).length;
  // Em andamento = ainda há etapa por disputar. Define "Líder" vs "Campeão".
  const inProgress = stages.some((s) => s.status === "scheduled");

  return (
    <>
      <PageHeading
        eyebrow={season.name}
        title="Ranking da temporada"
        subtitle={
          <>
            {realizadas.length} de {stages.length} etapas realizadas
            {proxima ? (
              <>
                {" · próxima: "}
                <Link
                  href={`/etapas/${proxima.id}`}
                  className="font-semibold text-chalk hover:text-cap-red-light"
                >
                  {stageName(proxima.number, proxima.eventDate, proxima.isFinal)}
                </Link>
                {` em ${formatShortDate(proxima.eventDate)}`}
              </>
            ) : null}
          </>
        }
        action={
          <Link
            href="/etapas"
            className="inline-flex items-center gap-2 rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-chalk transition-colors hover:border-cap-red hover:text-cap-red-light"
          >
            Ver etapas da temporada
          </Link>
        }
      />

      <SeasonTabs seasons={seasons} selectedYear={season.year} basePath="/" />

      {/* Números da temporada. */}
      <section className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Jogadores ativos"
          value={formatNumber(jogadoresAtivos)}
          hint={`${formatNumber(totals.participations)} participações`}
        />
        <StatCard
          label="Arrecadação total"
          value={formatBRL(totals.gross)}
          hint={`${realizadas.length} etapas`}
          icon={<ChipIcon className="h-5 w-5" />}
        />
        <StatCard
          label="Pote Acumulado"
          value={formatBRL(accumulatedReserve)}
          hint={`${formatNumber(settings.finalReservePct, 0)}% de cada etapa`}
          tone="gold"
          icon={<TrophyIcon className="h-5 w-5" />}
        />
        <StatCard
          label="Prêmios pagos"
          value={formatBRL(totals.prizesPaid)}
          hint={totals.prizesPaid === 0 ? "Ainda não lançados" : "Somando todas as etapas"}
        />
      </section>

      {jogadoresAtivos === 0 ? (
        <EmptyState
          title="Nenhum resultado lançado ainda"
          description="Assim que a primeira etapa for lançada no painel de administração, o ranking aparece aqui."
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
            <span className="section-title">Classificação geral</span>
            <RankingImage
              title={season.name}
              subtitle={`${realizadas.length} ${realizadas.length === 1 ? "etapa disputada" : "etapas disputadas"}${inProgress ? " · parcial" : ""}`}
              rows={ranking.map((r) => ({
                position: r.displayPosition,
                name: r.player.fullName,
                points: r.totalPoints,
                stagesPlayed: r.stagesPlayed,
                wins: r.wins,
              }))}
            />
          </div>
          <RankingTable rows={ranking} showFinancials={appSettings.showPlayerFinances} />
          <p className="mt-4 text-xs leading-relaxed text-chalk-dim">
            <strong className="text-chalk-dim/90">Prêmio</strong> é o total que o jogador recebeu de
            premiação.
            {appSettings.showPlayerFinances ? (
              <>
                {" "}
                <strong className="text-chalk-dim/90">Pago</strong> é o total que gastou (buy-in,
                re-buys e add-on) e <strong className="text-chalk-dim/90">Saldo</strong> é a
                diferença entre os dois.
              </>
            ) : null}{" "}
            As médias consideram apenas as etapas em que o jogador participou.
          </p>
        </>
      )}
    </>
  );
}
