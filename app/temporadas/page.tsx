import Link from "next/link";
import { ChipIcon, TrophyIcon } from "@/components/brand/icons";
import { EmptyState, ErrorNotice, PageHeading, SetupNotice } from "@/components/ui/primitives";
import { getSeasonBundle, listSeasons } from "@/lib/db/queries";
import { load } from "@/lib/db/load";
import { formatBRL, formatNumber } from "@/lib/domain/money";

export const dynamic = "force-dynamic";

export const metadata = { title: "Temporadas" };

export default async function TemporadasPage() {
  const result = await load(async () => {
    const seasons = await listSeasons();
    return Promise.all(
      seasons.map(async (season) => {
        const bundle = await getSeasonBundle(season);
        const campeao = bundle.ranking.find((row) => row.stagesPlayed > 0) ?? null;
        return {
          season,
          campeao,
          etapas: bundle.stages.length,
          realizadas: bundle.stages.filter((s) => s.status === "completed").length,
          jogadores: bundle.ranking.filter((r) => r.stagesPlayed > 0).length,
          arrecadacao: bundle.totals.gross,
          reserva: bundle.accumulatedReserve,
        };
      }),
    );
  });

  if (result.status === "unconfigured") return <SetupNotice />;
  if (result.status === "error") return <ErrorNotice message={result.message} />;

  if (result.data.length === 0) {
    return (
      <>
        <PageHeading title="Temporadas" />
        <EmptyState
          title="Nenhuma temporada cadastrada"
          description="Crie a primeira temporada no painel de administração."
        />
      </>
    );
  }

  return (
    <>
      <PageHeading
        eyebrow="Histórico"
        title="Temporadas"
        subtitle="Cada temporada corresponde a um ano-calendário da liga."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {result.data.map(({ season, campeao, etapas, realizadas, jogadores, arrecadacao, reserva }) => (
          <Link
            key={season.id}
            href={`/temporadas/${season.year}`}
            className="card felt-grain relative overflow-hidden p-5 transition-transform hover:-translate-y-0.5 hover:border-cap-red/40"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-extrabold text-chalk">{season.name}</h2>
                <p className="mt-1 text-xs text-chalk-dim">
                  {realizadas} de {etapas} etapas · {formatNumber(jogadores)} jogadores
                </p>
              </div>
              {season.is_current ? (
                <span className="rounded-full border border-cap-red/40 bg-cap-red/15 px-2.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-cap-red-light">
                  Em andamento
                </span>
              ) : null}
            </div>

            {campeao ? (
              <div className="mt-4 flex items-center gap-2.5 rounded-lg border border-gold/25 bg-gold/5 px-3 py-2">
                <TrophyIcon className="h-4 w-4 shrink-0 text-gold" />
                <div className="min-w-0">
                  <p className="text-[0.6rem] font-bold uppercase tracking-[0.16em] text-gold/70">
                    {season.is_current ? "Líder" : "Campeão"}
                  </p>
                  <p className="truncate text-sm font-bold text-chalk">{campeao.player.fullName}</p>
                </div>
                <span className="tnum ml-auto shrink-0 text-sm font-black text-gold-bright">
                  {formatNumber(campeao.totalPoints)} pts
                </span>
              </div>
            ) : null}

            <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-white/5 pt-3">
              <div>
                <dt className="flex items-center gap-1.5 text-[0.6rem] uppercase tracking-wider text-chalk-dim">
                  <ChipIcon className="h-3.5 w-3.5" /> Arrecadação
                </dt>
                <dd className="tnum mt-1 text-sm font-bold text-chalk">{formatBRL(arrecadacao)}</dd>
              </div>
              <div>
                <dt className="text-[0.6rem] uppercase tracking-wider text-chalk-dim">
                  Pote Acumulado
                </dt>
                <dd className="tnum mt-1 text-sm font-bold text-gold">{formatBRL(reserva)}</dd>
              </div>
            </dl>
          </Link>
        ))}
      </div>
    </>
  );
}
