import Link from "next/link";
import { notFound } from "next/navigation";
import { MedalIcon, TrophyIcon } from "@/components/brand/icons";
import {
  BackLink,
  EmptyState,
  ErrorNotice,
  PageHeading,
  PlayerTypeBadge,
  SetupNotice,
  StatCard,
} from "@/components/ui/primitives";
import { getAppSettings, getPlayerDetail } from "@/lib/db/queries";
import { load } from "@/lib/db/load";
import { formatBRL, formatBRLSigned, formatNumber } from "@/lib/domain/money";
import { formatShortDate, stageName } from "@/lib/domain/stage-name";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params) {
  const { id } = await params;
  const result = await load(() => getPlayerDetail(id));
  if (result.status !== "ok" || !result.data) return { title: "Jogador" };
  return { title: result.data.player.fullName };
}

function placementClass(placement: number | null): string {
  if (placement === 1) return "text-gold-bright";
  if (placement === 2) return "text-silver";
  if (placement === 3) return "text-bronze";
  return "text-chalk-dim";
}

export default async function JogadorPage({ params }: Params) {
  const { id } = await params;
  const result = await load(async () => {
    const [detail, appSettings] = await Promise.all([getPlayerDetail(id), getAppSettings()]);
    return detail ? { detail, appSettings } : null;
  });

  if (result.status === "unconfigured") return <SetupNotice />;
  if (result.status === "error") return <ErrorNotice message={result.message} />;
  if (!result.data) notFound();

  const { player, bySeason, career } = result.data.detail;
  const showFinances = result.data.appSettings.showPlayerFinances;
  const semFinanceiro = career.totalPaid === 0 && career.totalReceived === 0;
  // Re-buy/add-on só entrou no lançamento em 2026: com etapa em branco, somar o
  // que existe daria um número menor que o real e pareceria economia.
  const semExtras = career.stagesMissingExtras > 0 || career.extrasRecordedStages === 0;
  const mediaRebuys = semExtras ? null : career.totalRebuys / career.extrasRecordedStages;

  return (
    <>
      <div className="mb-4">
        <BackLink href="/jogadores">Todos os jogadores</BackLink>
      </div>

      <PageHeading
        eyebrow="Ficha do jogador"
        title={player.fullName}
        subtitle={
          <PlayerTypeBadge
            type={player.type}
            memberNumber={player.memberNumber}
            invitedByName={player.invitedByName}
          />
        }
      />

      {/* Números de carreira, somando todas as temporadas. */}
      <section
        className={`mb-8 grid grid-cols-2 gap-3 ${showFinances ? "lg:grid-cols-6" : "lg:grid-cols-4"}`}
      >
        <StatCard
          label="Pontos na carreira"
          value={formatNumber(career.totalPoints)}
          hint={`${career.stagesPlayed} etapas disputadas`}
        />
        <StatCard
          label="Etapas vencidas"
          value={formatNumber(career.wins)}
          hint={
            career.bestPlacement === null
              ? "Sem colocação registrada"
              : `Melhor colocação: ${career.bestPlacement}º`
          }
          tone={career.wins > 0 ? "gold" : "default"}
          icon={career.wins > 0 ? <TrophyIcon className="h-5 w-5" /> : undefined}
        />
        <StatCard
          label="Re-buys na carreira"
          value={semExtras ? "—" : formatNumber(career.totalRebuys)}
          hint={
            semExtras
              ? "Registrado a partir de 2026"
              : `${career.totalAddons} add-ons · ${formatNumber(mediaRebuys ?? 0, 1)} por etapa`
          }
        />
        {/* Prêmio: sempre visível — é o que o jogador ganhou. */}
        <StatCard
          label="Prêmios na carreira"
          value={career.totalReceived === 0 ? "—" : formatBRL(career.totalReceived)}
          hint="Somando todas as temporadas"
          tone={career.totalReceived > 0 ? "gold" : "default"}
        />
        {showFinances ? (
          <>
            <StatCard
              label="Total pago"
              value={semFinanceiro ? "—" : formatBRL(career.totalPaid)}
              hint="Buy-ins, re-buys e add-ons"
            />
            <StatCard
              label="Saldo"
              value={semFinanceiro ? "—" : formatBRLSigned(career.balance)}
              hint={semFinanceiro ? "Sem financeiro lançado" : "Prêmios menos gastos"}
              tone={semFinanceiro ? "default" : career.balance >= 0 ? "positive" : "negative"}
            />
          </>
        ) : null}
      </section>

      {bySeason.length === 0 ? (
        <EmptyState
          title="Ainda sem participações"
          description="Este jogador está cadastrado, mas ainda não disputou nenhuma etapa."
        />
      ) : (
        <div className="space-y-10">
          {bySeason.map(({ season, row, results }) => (
            <section key={season.id}>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="section-title">{season.name}</div>
                <Link
                  href={`/temporadas/${season.year}`}
                  className="text-xs font-semibold text-chalk-dim transition-colors hover:text-cap-red-light"
                >
                  ver ranking da temporada →
                </Link>
              </div>

              {/* Resumo da temporada. */}
              <dl className="card mb-4 grid grid-cols-2 gap-4 p-4 sm:grid-cols-4 lg:grid-cols-6">
                <Summary label="Classificação" value={`${row.position}º`} highlight />
                <Summary label="Pontos" value={formatNumber(row.totalPoints)} />
                <Summary label="Etapas" value={String(row.stagesPlayed)} />
                <Summary label="Média pts" value={formatNumber(row.averagePoints, 1)} />
                <Summary
                  label="Class. média"
                  value={
                    row.averagePlacement === null
                      ? "—"
                      : `${formatNumber(row.averagePlacement, 1)}º`
                  }
                />
                <Summary
                  label="Re-buys"
                  value={
                    row.stagesMissingExtras > 0
                      ? "—"
                      : `${row.totalRebuys} · ${row.totalAddons} add-on${row.totalAddons === 1 ? "" : "s"}`
                  }
                />
                <Summary
                  label="RB/etapa"
                  value={
                    row.stagesMissingExtras > 0 || row.averageRebuys === null
                      ? "—"
                      : formatNumber(row.averageRebuys, 1)
                  }
                />
                <Summary
                  label="Prêmio"
                  value={row.totalReceived === 0 ? "—" : formatBRL(row.totalReceived)}
                />
                {showFinances ? (
                  <Summary
                    label="Saldo"
                    value={
                      row.totalPaid === 0 && row.totalReceived === 0
                        ? "—"
                        : formatBRLSigned(row.balance)
                    }
                  />
                ) : null}
              </dl>

              {/* Etapa a etapa. */}
              <div className="card table-scroll">
                <table
                  className={`w-full border-collapse text-sm ${
                    showFinances ? "min-w-[48rem]" : "min-w-[40rem]"
                  }`}
                >
                  <thead>
                    <tr className="border-b border-ink-800 text-left text-[0.65rem] uppercase tracking-[0.12em] text-chalk-dim">
                      <th scope="col" className="px-3 py-3 font-bold">Etapa</th>
                      <th scope="col" className="px-3 py-3 font-bold">Data</th>
                      <th scope="col" className="px-3 py-3 text-right font-bold">Colocação</th>
                      <th scope="col" className="px-3 py-3 text-right font-bold">Pontos</th>
                      <th scope="col" className="px-3 py-3 text-right font-bold">Re-buys</th>
                      <th scope="col" className="px-3 py-3 text-right font-bold">Add-on</th>
                      <th scope="col" className="px-3 py-3 text-right font-bold">Prêmio</th>
                      {showFinances ? (
                        <th scope="col" className="px-3 py-3 text-right font-bold">Pago</th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r) => (
                      <tr
                        key={r.stageId}
                        className="border-b border-ink-850/60 transition-colors last:border-0 hover:bg-ink-850/40"
                      >
                        <td className="px-3 py-3">
                          <Link
                            href={`/etapas/${r.stageId}`}
                            className="inline-flex items-center gap-1.5 font-semibold text-chalk transition-colors hover:text-cap-red-light"
                          >
                            {r.isFinal ? <TrophyIcon className="h-3.5 w-3.5 text-gold" /> : null}
                            {stageName(r.stageNumber, r.eventDate, r.isFinal)}
                          </Link>
                        </td>
                        <td className="tnum px-3 py-3 text-chalk-dim">
                          {formatShortDate(r.eventDate)}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <span
                            className={`tnum inline-flex items-center justify-end gap-1.5 font-black ${placementClass(r.placement)}`}
                          >
                            {r.placement !== null && r.placement <= 3 ? (
                              <MedalIcon className="h-4 w-4" place={r.placement as 1 | 2 | 3} />
                            ) : null}
                            {`${r.placement}º`}
                          </span>
                        </td>
                        <td className="tnum px-3 py-3 text-right font-bold text-chalk">
                          {formatNumber(r.points)}
                        </td>
                        <td className="tnum px-3 py-3 text-right text-chalk-dim">
                          {r.rebuys === null ? "—" : r.rebuys}
                        </td>
                        <td className="tnum px-3 py-3 text-right text-chalk-dim">
                          {r.hadAddon === null ? "—" : r.hadAddon ? "sim" : "não"}
                        </td>
                        <td
                          className={`tnum px-3 py-3 text-right ${
                            r.prizeAmount > 0 ? "font-bold text-gold" : "text-chalk-dim"
                          }`}
                        >
                          {r.prizeAmount > 0 ? formatBRL(r.prizeAmount) : "—"}
                        </td>
                        {showFinances ? (
                          <td className="tnum px-3 py-3 text-right text-chalk-dim">
                            {r.amountPaid === null ? "—" : formatBRL(r.amountPaid)}
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

function Summary({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <dt className="text-[0.6rem] font-bold uppercase tracking-[0.14em] text-chalk-dim">
        {label}
      </dt>
      <dd
        className={`tnum mt-1 text-lg font-extrabold ${highlight ? "text-cap-red-light" : "text-chalk"}`}
      >
        {value}
      </dd>
    </div>
  );
}
