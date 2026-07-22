import Link from "next/link";
import { FinalInviteesEditor } from "@/components/admin/final-invitees-editor";
import { AdminCard, Flash } from "@/components/admin/ui";
import { TrophyIcon } from "@/components/brand/icons";
import { ErrorNotice, SetupNotice, StatCard } from "@/components/ui/primitives";
import { getCurrentSeason, getFinalInvitees, getSeasonBundle } from "@/lib/db/queries";
import { load } from "@/lib/db/load";
import { formatBRL } from "@/lib/domain/money";
import { suggestFinalInvitees } from "@/lib/domain/ranking";
import { formatShortDate, stageName } from "@/lib/domain/stage-name";

export const dynamic = "force-dynamic";

export const metadata = { title: "Etapa Final · Admin" };

type SearchParams = Promise<{ ok?: string; erro?: string }>;

export default async function AdminFinal({ searchParams }: { searchParams: SearchParams }) {
  const { ok, erro } = await searchParams;

  const result = await load(async () => {
    const season = await getCurrentSeason();
    if (!season) return null;

    const bundle = await getSeasonBundle(season);
    const finalStage = bundle.stages.find((stage) => stage.isFinal) ?? null;
    const invitees = finalStage ? await getFinalInvitees(finalStage.id) : [];
    return { bundle, finalStage, invitees };
  });

  if (result.status === "unconfigured") return <SetupNotice />;
  if (result.status === "error") return <ErrorNotice message={result.message} />;

  if (!result.data) {
    return (
      <>
        <Flash ok={ok} erro={erro} />
        <AdminCard title="Nenhuma temporada cadastrada" />
      </>
    );
  }

  const { bundle, finalStage, invitees } = result.data;
  const { season, stages, players, entries, settings, accumulatedReserve, finalPot } = bundle;

  const cutoffStage = stages.find((stage) => stage.isOctoberCutoff) ?? null;

  // Etapas que contam para a sugestão: tudo até o corte, ou tudo o que já
  // aconteceu se o corte ainda não foi marcado.
  const stagesUpToCutoff = cutoffStage
    ? stages
        .filter((stage) => !stage.isFinal && stage.eventDate <= cutoffStage.eventDate)
        .map((stage) => stage.id)
    : stages.filter((stage) => !stage.isFinal).map((stage) => stage.id);

  const suggestedRows = suggestFinalInvitees(
    players,
    entries,
    stagesUpToCutoff,
    settings.finalInviteCount,
  );

  // Ranking completo até o corte, para o admin poder convidar substitutos.
  const rankingUpToCutoff = suggestFinalInvitees(
    players,
    entries,
    stagesUpToCutoff,
    Number.MAX_SAFE_INTEGER,
  );

  return (
    <>
      <Flash ok={ok} erro={erro} />

      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-xl font-extrabold text-chalk">
          <TrophyIcon className="h-5 w-5 text-gold" />
          Etapa Final · {season.name}
        </h1>
        <p className="mt-1 text-sm text-chalk-dim">
          Disputada pelos primeiros colocados do ranking. Ela distribui o pote acumulado no ano —
          menos a parte que premia os líderes da classificação.
        </p>
      </div>

      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard
          label="Pote na mesa da Final"
          value={formatBRL(finalPot.stagePot)}
          hint={`${formatBRL(accumulatedReserve)} acumulados − ${formatBRL(finalPot.rankingShare)} dos líderes do ranking`}
          tone="gold"
        />
        <StatCard
          label="Etapa de corte"
          value={
            cutoffStage
              ? stageName(cutoffStage.number, cutoffStage.eventDate, false)
              : "Não definida"
          }
          hint={
            cutoffStage
              ? formatShortDate(cutoffStage.eventDate)
              : "Marque uma etapa como corte na tela de Etapas"
          }
        />
        <StatCard
          label="Convidados automáticos"
          value={String(settings.finalInviteCount)}
          hint="Editável em Configurações"
        />
      </section>

      {/* Quem recebe o quê do acumulado — é o admin que paga, precisa ver os
          valores, não só o total. */}
      <AdminCard
        title="Prêmio dos líderes do ranking"
        description={`${settings.rankingSharePct}% do Pote Acumulado, pago pela classificação final da temporada. Editável em Configurações.`}
      >
        <ul className="tnum space-y-1.5 text-sm">
          {finalPot.byRankingPlace.map((premio) => {
            const nomes = bundle.ranking
              .filter((r) => r.stagesPlayed > 0 && r.displayPosition === premio.place)
              .map((r) => r.player.fullName);
            return (
              <li key={premio.place} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-chalk-dim">
                  <strong className="font-bold text-chalk">{premio.place}º</strong>{" "}
                  {nomes.length > 0 ? nomes.join(" · ") : "a definir"}
                </span>
                <span className="shrink-0 font-bold text-gold">{formatBRL(premio.amount)}</span>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-chalk-dim">
          Os nomes são a classificação de agora e mudam até a última etapa. Empate mostra os dois —
          a divisão do prêmio nesse caso é decisão da liga.
        </p>
      </AdminCard>

      {!finalStage ? (
        <AdminCard title="A Etapa Final ainda não foi cadastrada">
          <p className="text-sm text-chalk-dim">
            Crie a etapa em{" "}
            <Link href="/admin/etapas" className="font-semibold text-cap-red-light">
              Etapas
            </Link>{" "}
            e marque a opção <strong className="text-chalk">“É a Etapa Final”</strong>. Depois volte
            aqui para montar a lista de convidados.
          </p>
        </AdminCard>
      ) : rankingUpToCutoff.length === 0 ? (
        <AdminCard title="Ainda não há ranking para sugerir convidados">
          <p className="text-sm text-chalk-dim">
            Nenhuma etapa com resultado lançado até o corte. A sugestão aparece assim que houver
            classificação.
          </p>
        </AdminCard>
      ) : (
        <>
          <p className="mb-5 rounded-lg border border-ink-800 bg-ink-900 px-4 py-3 text-sm text-chalk-dim">
            A lista abaixo já vem com os {settings.finalInviteCount} primeiros do ranking
            {cutoffStage
              ? ` até ${stageName(cutoffStage.number, cutoffStage.eventDate, false)}`
              : ""}
            . Se algum deles não puder participar, remova-o e adicione o próximo colocado — a lista
            é totalmente livre.
          </p>

          <FinalInviteesEditor
            stageId={finalStage.id}
            ranking={rankingUpToCutoff}
            suggested={suggestedRows.map((row) => row.player.id)}
            initial={invitees}
            inviteCount={settings.finalInviteCount}
          />

          <p className="mt-5 text-sm text-chalk-dim">
            Depois de definir os convidados, lance o resultado em{" "}
            <Link
              href={`/admin/etapas/${finalStage.id}`}
              className="font-semibold text-cap-red-light"
            >
              {stageName(finalStage.number, finalStage.eventDate, true)}
            </Link>
            .
          </p>
        </>
      )}
    </>
  );
}
