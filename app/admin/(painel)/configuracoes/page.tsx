import Link from "next/link";
import { saveAppSettings, saveSettings } from "@/app/admin/actions";
import { AdminCard, Field, Flash, PrimaryButton, inputClass } from "@/components/admin/ui";
import { ErrorNotice, SetupNotice } from "@/components/ui/primitives";
import {
  getAppSettings,
  getCurrentSeason,
  getSeasonBundle,
  listSeasons,
  type AppSettings,
} from "@/lib/db/queries";
import { load } from "@/lib/db/load";
import { formatBRL, formatNumber } from "@/lib/domain/money";
import { splitFinalPot, suggestStagePrizes } from "@/lib/domain/prizes";
import { CUTOFF_PLACEMENT } from "@/lib/domain/scoring";

export const dynamic = "force-dynamic";

export const metadata = { title: "Configurações · Admin" };

type SearchParams = Promise<{ ok?: string; erro?: string; temporada?: string }>;

export default async function AdminConfiguracoes({ searchParams }: { searchParams: SearchParams }) {
  const { ok, erro, temporada } = await searchParams;

  const result = await load(async () => {
    const seasons = await listSeasons();
    if (seasons.length === 0) return { seasons, bundle: null, appSettings: await getAppSettings() };
    const selected =
      seasons.find((s) => s.id === temporada) ?? (await getCurrentSeason()) ?? seasons[0];
    const [bundle, appSettings] = await Promise.all([getSeasonBundle(selected), getAppSettings()]);
    return { seasons, bundle, appSettings };
  });

  if (result.status === "unconfigured") return <SetupNotice />;
  if (result.status === "error") return <ErrorNotice message={result.message} />;

  const { seasons, bundle, appSettings } = result.data;

  if (!bundle) {
    return (
      <>
        <Flash ok={ok} erro={erro} />
        <AreaPublicaCard appSettings={appSettings} />
        <AdminCard title="Nenhuma temporada cadastrada">
          <p className="text-sm text-chalk-dim">
            As configurações de pontuação e premiação são por temporada.{" "}
            <Link href="/admin/temporadas" className="font-semibold text-cap-red-light">
              Crie a primeira
            </Link>
            .
          </p>
        </AdminCard>
      </>
    );
  }

  const { season, settings, pointsTable } = bundle;

  // Colocações a exibir: as que existem na tabela, sempre cobrindo 1 a 15.
  const placements = [...new Set([...Array.from({ length: 15 }, (_, i) => i + 1), ...Object.keys(pointsTable).map(Number)])]
    .filter((placement) => placement < CUTOFF_PLACEMENT)
    .sort((a, b) => a - b);

  // Prévia com um exemplo concreto, para o admin ver o efeito das regras.
  const exemplo = suggestStagePrizes(
    { gross: 10000, participants: 30, otherCosts: 0 },
    settings,
  );
  // Os quatro percentuais precisam somar 100; se não somarem, o app reparte
  // proporcionalmente, mas o admin merece o aviso.
  const somaPct =
    settings.firstPct + settings.secondPct + settings.thirdPct + settings.fourthPct;

  // Divisão do que a temporada já acumulou, para o exemplo sair com números reais.
  const potePreview = splitFinalPot(bundle.accumulatedReserve, settings);
  const somaRankingPct =
    settings.rankingFirstPct + settings.rankingSecondPct + settings.rankingThirdPct;

  return (
    <>
      <Flash ok={ok} erro={erro} />

      <AreaPublicaCard appSettings={appSettings} />

      {seasons.length > 1 ? (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-[0.14em] text-chalk-dim">
            Temporada
          </span>
          {seasons.map((option) => (
            <Link
              key={option.id}
              href={`/admin/configuracoes?temporada=${option.id}`}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                option.id === season.id
                  ? "border-cap-red bg-cap-red/15 text-cap-red-light"
                  : "border-ink-700 text-chalk-dim hover:text-chalk"
              }`}
            >
              {option.year}
            </Link>
          ))}
        </div>
      ) : null}

      <p className="mb-5 rounded-lg border border-ink-800 bg-ink-900 px-4 py-3 text-sm text-chalk-dim">
        Estas regras valem para <strong className="text-chalk">{season.name}</strong>. Alterá-las
        não recalcula etapas já lançadas — os pontos e prêmios de cada etapa ficam gravados como
        foram salvos.
      </p>

      <form action={saveSettings} className="space-y-5">
        <input type="hidden" name="temporada" value={season.id} />

        <div className="grid gap-5 lg:grid-cols-2">
          {/* ------------------------------------------------------------ */}
          <AdminCard
            title="Valores da mesa"
            description="Usados para sugerir o gasto de cada jogador ao lançar uma etapa."
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Buy-in (R$)" htmlFor="buyin">
                <input
                  id="buyin"
                  name="buyin"
                  defaultValue={settings.buyin}
                  inputMode="decimal"
                  className={`${inputClass} tnum text-right`}
                />
              </Field>
              <Field label="Re-buy (R$)" htmlFor="rebuy">
                <input
                  id="rebuy"
                  name="rebuy"
                  defaultValue={settings.rebuy}
                  inputMode="decimal"
                  className={`${inputClass} tnum text-right`}
                />
              </Field>
              <Field label="Add-on (R$)" htmlFor="addon">
                <input
                  id="addon"
                  name="addon"
                  defaultValue={settings.addon}
                  inputMode="decimal"
                  className={`${inputClass} tnum text-right`}
                />
              </Field>
              <Field
                label="Taxa de adm. por jogador (R$)"
                htmlFor="taxaAdmin"
                hint="Deduzida da arrecadação de cada etapa antes da reserva. Ajustável etapa a etapa."
              >
                <input
                  id="taxaAdmin"
                  name="taxaAdmin"
                  defaultValue={settings.adminFeePerPlayer}
                  inputMode="decimal"
                  className={`${inputClass} tnum text-right`}
                />
              </Field>
            </div>
          </AdminCard>

          {/* ------------------------------------------------------------ */}
          <AdminCard
            title="Premiação"
            description="Aplicada sobre a arrecadação já descontada a reserva da Final."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Reserva da Final (%)"
                htmlFor="reserva"
                hint="Separado de cada etapa e acumulado para a Etapa Final."
              >
                <input
                  id="reserva"
                  name="reserva"
                  defaultValue={settings.finalReservePct}
                  inputMode="decimal"
                  className={`${inputClass} tnum text-right`}
                />
              </Field>
              <Field label="1º lugar (%)" htmlFor="premio1">
                <input
                  id="premio1"
                  name="premio1"
                  defaultValue={settings.firstPct}
                  inputMode="decimal"
                  className={`${inputClass} tnum text-right`}
                />
              </Field>
              <Field label="2º lugar (%)" htmlFor="premio2">
                <input
                  id="premio2"
                  name="premio2"
                  defaultValue={settings.secondPct}
                  inputMode="decimal"
                  className={`${inputClass} tnum text-right`}
                />
              </Field>
              <Field label="3º lugar (%)" htmlFor="premio3">
                <input
                  id="premio3"
                  name="premio3"
                  defaultValue={settings.thirdPct}
                  inputMode="decimal"
                  className={`${inputClass} tnum text-right`}
                />
              </Field>
              <Field
                label="4º lugar (%)"
                htmlFor="premio4"
                hint={`Somam ${somaPct}%. O 5º leva inscrição + 1 add-on, deduzido antes da reserva.`}
              >
                <input
                  id="premio4"
                  name="premio4"
                  defaultValue={settings.fourthPct}
                  inputMode="decimal"
                  className={`${inputClass} tnum text-right`}
                />
              </Field>
            </div>

            {somaPct !== 100 ? (
              <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
                Os percentuais de 1º a 4º somam {somaPct}%, não 100%. A premiação é repartida
                proporcionalmente para não estourar o caixa, mas vale conferir os valores.
              </p>
            ) : null}

            {/* Prévia concreta da regra. */}
            <div className="mt-4 rounded-lg border border-ink-800 bg-ink-950 px-4 py-3">
              <p className="text-[0.65rem] font-bold uppercase tracking-[0.14em] text-chalk-dim">
                Exemplo: {formatBRL(10000)} arrecadados com 30 jogadores
              </p>
              <ul className="tnum mt-2 space-y-0.5 text-sm text-chalk-dim">
                <li>
                  Taxa de administração:{" "}
                  <strong className="text-chalk">− {formatBRL(exemplo.adminFeeTotal)}</strong>
                </li>
                <li>
                  Prêmio do 5º (inscrição + add-on):{" "}
                  <strong className="text-chalk">− {formatBRL(exemplo.fifthPrize)}</strong>
                </li>
                <li>
                  Reserva Etapa Final:{" "}
                  <strong className="text-gold">{formatBRL(exemplo.reserve)}</strong>
                </li>
                {exemplo.byPlacement.map((prize) => (
                  <li key={prize.placement}>
                    {prize.placement}º lugar:{" "}
                    <strong className="text-chalk">{formatBRL(prize.amount)}</strong>
                  </li>
                ))}
              </ul>
            </div>
          </AdminCard>
        </div>

        {/* -------------------------------------------------------------- */}
        <AdminCard
          title="Tabela de pontuação"
          description="Pontos creditados por colocação. Quem termina abaixo do corte recebe o valor fixo."
        >
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-8">
            {placements.map((placement) => (
              <div key={placement}>
                <label
                  htmlFor={`pontos-${placement}`}
                  className="mb-1 block text-center text-[0.65rem] font-bold text-chalk-dim"
                >
                  {placement}º
                </label>
                <input
                  id={`pontos-${placement}`}
                  name={`pontos-${placement}`}
                  type="number"
                  min={0}
                  defaultValue={pointsTable[placement] ?? ""}
                  className={`${inputClass} tnum text-center`}
                />
              </div>
            ))}

            <div>
              <label
                htmlFor="pontosAbaixo"
                className="mb-1 block text-center text-[0.65rem] font-bold text-cap-red-light"
              >
                {CUTOFF_PLACEMENT}º+
              </label>
              <input
                id="pontosAbaixo"
                name="pontosAbaixo"
                type="number"
                min={0}
                defaultValue={settings.pointsBelowCutoff}
                className={`${inputClass} tnum border-cap-red/40 text-center`}
              />
            </div>
          </div>
        </AdminCard>

        {/* -------------------------------------------------------------- */}
        <AdminCard
          title="Pote Acumulado"
          description="Os 10% separados de cada etapa não vão todos para a mesa da Final: parte premia os líderes do ranking da temporada."
        >
          <div className="grid gap-5 lg:grid-cols-2">
            <div>
              <div className="max-w-xs">
                <Field
                  label="Parte dos líderes do ranking (%)"
                  htmlFor="rankingShare"
                  hint={`O restante — ${formatNumber(100 - settings.rankingSharePct, 0)}% — é o pote disputado na mesa da Etapa Final.`}
                >
                  <input
                    id="rankingShare"
                    name="rankingShare"
                    inputMode="decimal"
                    defaultValue={settings.rankingSharePct}
                    className={`${inputClass} tnum text-right`}
                  />
                </Field>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <Field label="1º do ranking (%)" htmlFor="ranking1">
                  <input
                    id="ranking1"
                    name="ranking1"
                    inputMode="decimal"
                    defaultValue={settings.rankingFirstPct}
                    className={`${inputClass} tnum text-right`}
                  />
                </Field>
                <Field label="2º do ranking (%)" htmlFor="ranking2">
                  <input
                    id="ranking2"
                    name="ranking2"
                    inputMode="decimal"
                    defaultValue={settings.rankingSecondPct}
                    className={`${inputClass} tnum text-right`}
                  />
                </Field>
                <Field
                  label="3º do ranking (%)"
                  htmlFor="ranking3"
                  hint={`Somam ${formatNumber(somaRankingPct, 0)}% da parte dos líderes.`}
                >
                  <input
                    id="ranking3"
                    name="ranking3"
                    inputMode="decimal"
                    defaultValue={settings.rankingThirdPct}
                    className={`${inputClass} tnum text-right`}
                  />
                </Field>
              </div>

              {somaRankingPct !== 100 ? (
                <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
                  Os percentuais de 1º a 3º do ranking somam {formatNumber(somaRankingPct, 0)}%, não
                  100%. O app reparte proporcionalmente para não estourar o pote, mas vale conferir.
                </p>
              ) : null}
            </div>

            {/* Prévia com o acumulado real da temporada. */}
            <div className="rounded-lg border border-ink-800 bg-ink-950 px-4 py-3">
              <p className="text-[0.65rem] font-bold uppercase tracking-[0.14em] text-chalk-dim">
                {season.name}: {formatBRL(potePreview.accumulated)} acumulados até agora
              </p>
              <ul className="tnum mt-2 space-y-0.5 text-sm text-chalk-dim">
                <li>
                  Mesa da Etapa Final:{" "}
                  <strong className="text-gold">{formatBRL(potePreview.stagePot)}</strong>
                </li>
                <li>
                  Líderes do ranking:{" "}
                  <strong className="text-chalk">{formatBRL(potePreview.rankingShare)}</strong>
                </li>
                {potePreview.byRankingPlace.map((premio) => (
                  <li key={premio.place} className="pl-4">
                    {premio.place}º do ranking:{" "}
                    <strong className="text-chalk">{formatBRL(premio.amount)}</strong>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-chalk-dim">
                O acumulado cresce a cada etapa lançada; estes valores acompanham.
              </p>
            </div>
          </div>
        </AdminCard>

        {/* -------------------------------------------------------------- */}
        <AdminCard title="Etapa Final">
          <div className="max-w-xs">
            <Field
              label="Convidados automáticos"
              htmlFor="convidadosFinal"
              hint="Quantos primeiros do ranking são sugeridos após a etapa de corte. A lista continua editável."
            >
              <input
                id="convidadosFinal"
                name="convidadosFinal"
                type="number"
                min={0}
                defaultValue={settings.finalInviteCount}
                className={`${inputClass} tnum text-right`}
              />
            </Field>
          </div>
        </AdminCard>

        <PrimaryButton>Salvar configurações</PrimaryButton>
      </form>
    </>
  );
}

/**
 * Liga/desliga a exibição de Pago, Saldo e ROI por jogador na área pública.
 * É uma preferência GLOBAL (vale para todas as temporadas), por isso mora num
 * formulário próprio, separado das configurações por temporada. O Prêmio — o
 * que o jogador ganhou — continua sempre visível.
 */
function AreaPublicaCard({ appSettings }: { appSettings: AppSettings }) {
  return (
    <AdminCard
      title="Área pública"
      description="Vale para o site inteiro, todas as temporadas."
    >
      <form action={saveAppSettings} className="space-y-4">
        <label className="flex items-start gap-3 text-sm text-chalk">
          <input
            type="checkbox"
            name="mostrarFinancas"
            defaultChecked={appSettings.showPlayerFinances}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-ink-600 bg-ink-950 accent-cap-red"
          />
          <span>
            Mostrar <strong>quanto cada jogador pagou, o saldo e o ROI</strong> nas tabelas
            públicas.
            <span className="mt-1 block text-xs text-chalk-dim">
              Desmarcado, some tudo isso do ranking, das etapas e das fichas de jogador. O{" "}
              <strong className="text-chalk-dim/90">Prêmio</strong> (o que cada um ganhou) continua
              aparecendo.
            </span>
          </span>
        </label>

        <PrimaryButton>Salvar preferência</PrimaryButton>
      </form>
    </AdminCard>
  );
}
