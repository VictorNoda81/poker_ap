import { PlayersDirectory } from "@/components/players-directory";
import { EmptyState, ErrorNotice, PageHeading, SetupNotice } from "@/components/ui/primitives";
import { getAppSettings, getPlayersAcrossSeasons } from "@/lib/db/queries";
import { load } from "@/lib/db/load";

export const dynamic = "force-dynamic";

export const metadata = { title: "Jogadores" };

export default async function JogadoresPage() {
  const result = await load(async () => {
    const [dir, appSettings] = await Promise.all([getPlayersAcrossSeasons(), getAppSettings()]);
    return { ...dir, appSettings };
  });

  if (result.status === "unconfigured") return <SetupNotice />;
  if (result.status === "error") return <ErrorNotice message={result.message} />;

  const { seasons, players, appSettings } = result.data;

  if (players.length === 0) {
    return (
      <>
        <PageHeading title="Jogadores" />
        <EmptyState
          title="Nenhum jogador cadastrado"
          description="Cadastre jogadores no painel de administração ou rode o seed para importar as temporadas."
        />
      </>
    );
  }

  return (
    <>
      <PageHeading
        eyebrow="Histórico"
        title="Jogadores"
        subtitle="Filtre por temporada (várias ao mesmo tempo) ou escolha “Todas” para o histórico completo. Abra um jogador para ver etapa a etapa."
      />
      <PlayersDirectory
        seasons={seasons}
        players={players}
        showFinances={appSettings.showPlayerFinances}
      />
    </>
  );
}
