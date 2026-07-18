import { createSeason, setCurrentSeason } from "@/app/admin/actions";
import { AdminCard, Field, Flash, GhostButton, PrimaryButton, inputClass } from "@/components/admin/ui";
import { ErrorNotice, SetupNotice } from "@/components/ui/primitives";
import { getSeasonBundle, listSeasons } from "@/lib/db/queries";
import { load } from "@/lib/db/load";
import { formatBRL, formatNumber } from "@/lib/domain/money";

export const dynamic = "force-dynamic";

export const metadata = { title: "Temporadas · Admin" };

export default async function AdminTemporadas({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erro?: string }>;
}) {
  const { ok, erro } = await searchParams;

  const result = await load(async () => {
    const seasons = await listSeasons();
    return Promise.all(
      seasons.map(async (season) => {
        const bundle = await getSeasonBundle(season);
        return {
          season,
          etapas: bundle.stages.length,
          jogadores: bundle.ranking.filter((r) => r.stagesPlayed > 0).length,
          arrecadacao: bundle.totals.gross,
        };
      }),
    );
  });

  if (result.status === "unconfigured") return <SetupNotice />;
  if (result.status === "error") return <ErrorNotice message={result.message} />;

  const anoSugerido = new Date().getFullYear();

  return (
    <>
      <Flash ok={ok} erro={erro} />

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <AdminCard
          title="Temporadas"
          description="A temporada marcada como atual é a que aparece na página inicial do site."
        >
          {result.data.length === 0 ? (
            <p className="py-6 text-center text-sm text-chalk-dim">
              Nenhuma temporada cadastrada ainda.
            </p>
          ) : (
            <ul className="divide-y divide-ink-850">
              {result.data.map(({ season, etapas, jogadores, arrecadacao }) => (
                <li
                  key={season.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div>
                    <p className="flex items-center gap-2 font-bold text-chalk">
                      {season.name}
                      {season.is_current ? (
                        <span className="rounded-full border border-cap-red/40 bg-cap-red/15 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-cap-red-light">
                          Atual
                        </span>
                      ) : null}
                    </p>
                    <p className="tnum mt-1 text-xs text-chalk-dim">
                      {etapas} etapas · {formatNumber(jogadores)} jogadores ·{" "}
                      {formatBRL(arrecadacao)}
                    </p>
                  </div>

                  {!season.is_current ? (
                    <form action={setCurrentSeason}>
                      <input type="hidden" name="id" value={season.id} />
                      <GhostButton type="submit">Tornar atual</GhostButton>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </AdminCard>

        <AdminCard
          title="Nova temporada"
          description="Cria a temporada já com a tabela de pontuação e os valores padrão da liga."
        >
          <form action={createSeason} className="space-y-4">
            <Field label="Ano" htmlFor="ano">
              <input
                id="ano"
                name="ano"
                type="number"
                min={2000}
                max={2100}
                defaultValue={anoSugerido + 1}
                required
                className={inputClass}
              />
            </Field>

            <label className="flex items-start gap-2.5 text-sm text-chalk-dim">
              <input
                type="checkbox"
                name="atual"
                className="mt-0.5 h-4 w-4 rounded border-ink-600 bg-ink-950 accent-cap-red"
              />
              <span>
                Tornar esta a temporada atual
                <span className="mt-0.5 block text-xs text-chalk-dim/70">
                  A temporada anterior deixa de ser a atual, mas continua visível no histórico.
                </span>
              </span>
            </label>

            <PrimaryButton>Criar temporada</PrimaryButton>
          </form>
        </AdminCard>
      </div>
    </>
  );
}
