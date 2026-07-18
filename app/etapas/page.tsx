import { StagesList } from "@/components/stages-list";
import { EmptyState, ErrorNotice, PageHeading, SetupNotice } from "@/components/ui/primitives";
import { getSeasonBundle, listSeasons } from "@/lib/db/queries";
import { load } from "@/lib/db/load";

export const dynamic = "force-dynamic";

export const metadata = { title: "Etapas" };

export default async function EtapasPage() {
  const result = await load(async () => {
    const seasons = await listSeasons();
    return Promise.all(
      seasons.map(async (season) => ({
        season,
        stages: (await getSeasonBundle(season)).stages,
      })),
    );
  });

  if (result.status === "unconfigured") return <SetupNotice />;
  if (result.status === "error") return <ErrorNotice message={result.message} />;

  const comEtapas = result.data.filter((group) => group.stages.length > 0);

  return (
    <>
      <PageHeading
        eyebrow="Histórico"
        title="Etapas"
        subtitle="Todas as etapas da liga, temporada a temporada. Clique em uma etapa para ver o resultado completo."
      />

      {comEtapas.length === 0 ? (
        <EmptyState title="Nenhuma etapa cadastrada" />
      ) : (
        <div className="space-y-10">
          {comEtapas.map(({ season, stages }) => (
            <section key={season.id}>
              <div className="section-title mb-4">{season.name}</div>
              <StagesList stages={stages} />
            </section>
          ))}
        </div>
      )}
    </>
  );
}
