import { PlayersDirectory } from "@/components/players-directory";
import { EmptyState, ErrorNotice, PageHeading, SetupNotice } from "@/components/ui/primitives";
import { getCurrentSeason, getSeasonBundle } from "@/lib/db/queries";
import { load } from "@/lib/db/load";

export const dynamic = "force-dynamic";

export const metadata = { title: "Jogadores" };

export default async function JogadoresPage() {
  const result = await load(async () => {
    const season = await getCurrentSeason();
    if (!season) return null;
    return getSeasonBundle(season);
  });

  if (result.status === "unconfigured") return <SetupNotice />;
  if (result.status === "error") return <ErrorNotice message={result.message} />;

  if (!result.data || result.data.ranking.length === 0) {
    return (
      <>
        <PageHeading title="Jogadores" />
        <EmptyState
          title="Nenhum jogador cadastrado"
          description="Cadastre jogadores no painel de administração ou rode o seed para importar a temporada 2026."
        />
      </>
    );
  }

  return (
    <>
      <PageHeading
        eyebrow={result.data.season.name}
        title="Jogadores"
        subtitle="Os números mostrados são da temporada atual. Abra um jogador para ver o histórico completo."
      />
      <PlayersDirectory rows={result.data.ranking} />
    </>
  );
}
