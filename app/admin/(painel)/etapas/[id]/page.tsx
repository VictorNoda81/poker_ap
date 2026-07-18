import Link from "next/link";
import { notFound } from "next/navigation";
import { saveStage } from "@/app/admin/actions";
import { StageResultsEditor, type EditorEntry } from "@/components/admin/stage-results-editor";
import { Field, Flash, PrimaryButton, inputClass } from "@/components/admin/ui";
import { TrophyIcon } from "@/components/brand/icons";
import { BackLink, ErrorNotice, SetupNotice } from "@/components/ui/primitives";
import { getStageDetail, listPlayers, getSeasonBundle, getSeasonByYear } from "@/lib/db/queries";
import { load } from "@/lib/db/load";
import { formatLongDate, stageName } from "@/lib/domain/stage-name";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; erro?: string }>;
};

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await load(() => getStageDetail(id));
  if (result.status !== "ok" || !result.data) return { title: "Etapa · Admin" };
  const { stage } = result.data;
  return { title: `${stageName(stage.number, stage.eventDate, stage.isFinal)} · Admin` };
}

export default async function AdminEtapa({ params, searchParams }: Params) {
  const { id } = await params;
  const { ok, erro } = await searchParams;

  const result = await load(async () => {
    const detail = await getStageDetail(id);
    if (!detail) return null;

    const season = await getSeasonByYear(detail.season.year);
    if (!season) return null;

    const [bundle, players] = await Promise.all([getSeasonBundle(season), listPlayers()]);
    return { detail, bundle, players };
  });

  if (result.status === "unconfigured") return <SetupNotice />;
  if (result.status === "error") return <ErrorNotice message={result.message} />;
  if (!result.data) notFound();

  const { detail, bundle, players } = result.data;
  const { stage, season } = detail;
  const nome = stageName(stage.number, stage.eventDate, stage.isFinal);

  const entries: EditorEntry[] = detail.entries.map((entry) => ({
    playerId: entry.player.id,
    placement: entry.placement,
    amountPaid: entry.amountPaid,
    rebuys: entry.rebuys,
    hadAddon: entry.hadAddon,
    prizeAmount: entry.prizeAmount,
    needsReview: entry.needsReview,
    reviewNote: entry.reviewNote,
  }));

  // Reserva acumulada nas demais etapas — é o bolo que a Final distribui.
  const accumulatedReserve = bundle.stages
    .filter((s) => s.id !== stage.id)
    .reduce((sum, s) => sum + s.reserve, 0);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <BackLink href={`/admin/etapas?temporada=${season.id}`}>Etapas de {season.year}</BackLink>
        <Link
          href={`/etapas/${stage.id}`}
          className="text-xs font-semibold text-chalk-dim transition-colors hover:text-cap-red-light"
        >
          ver página pública →
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-xl font-extrabold text-chalk">
          {stage.isFinal ? <TrophyIcon className="h-5 w-5 text-gold" /> : null}
          {nome}
        </h1>
        <p className="mt-1 text-sm text-chalk-dim">
          {formatLongDate(stage.eventDate)} · {season.name}
        </p>
      </div>

      <Flash ok={ok} erro={erro} />

      {stage.needsReviewCount > 0 ? (
        <p className="mb-5 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-300">
          {stage.needsReviewCount} participações desta etapa vieram da planilha com colocação
          ambígua. Confira as marcadas como “revisar” — salvar o resultado limpa a marcação.
        </p>
      ) : null}

      {/* ------------------------------------------------------------------ */}
      {/* Dados da etapa                                                      */}
      {/* ------------------------------------------------------------------ */}
      <details className="card mb-5 p-5">
        <summary className="cursor-pointer text-sm font-bold text-chalk">Dados da etapa</summary>

        <form action={saveStage} className="mt-4 grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="id" value={stage.id} />
          <input type="hidden" name="temporada" value={season.id} />
          <input type="hidden" name="status" value={stage.status} />

          <Field label="Número" htmlFor="numero">
            <input
              id="numero"
              name="numero"
              type="number"
              min={1}
              defaultValue={stage.number}
              className={inputClass}
            />
          </Field>

          <Field label="Data" htmlFor="data">
            <input
              id="data"
              name="data"
              type="date"
              defaultValue={stage.eventDate.slice(0, 10)}
              className={inputClass}
            />
          </Field>

          <label className="flex items-start gap-2.5 text-sm text-chalk-dim">
            <input
              type="checkbox"
              name="corte"
              defaultChecked={stage.isOctoberCutoff}
              className="mt-0.5 h-4 w-4 rounded border-ink-600 bg-ink-950 accent-cap-red"
            />
            <span>Etapa de corte para a Final</span>
          </label>

          <label className="flex items-start gap-2.5 text-sm text-chalk-dim">
            <input
              type="checkbox"
              name="final"
              defaultChecked={stage.isFinal}
              className="mt-0.5 h-4 w-4 rounded border-ink-600 bg-ink-950 accent-cap-red"
            />
            <span>É a Etapa Final</span>
          </label>

          <div className="sm:col-span-2">
            <PrimaryButton>Salvar dados da etapa</PrimaryButton>
          </div>
        </form>
      </details>

      {/* ------------------------------------------------------------------ */}
      {/* Lançamento                                                          */}
      {/* ------------------------------------------------------------------ */}
      <StageResultsEditor
        stageId={stage.id}
        players={players}
        settings={{
          buyin: bundle.settings.buyin,
          rebuy: bundle.settings.rebuy,
          addon: bundle.settings.addon,
          finalReservePct: bundle.settings.finalReservePct,
          firstPct: bundle.settings.firstPct,
          secondPct: bundle.settings.secondPct,
          fourthFixed: bundle.settings.fourthFixed,
          pointsBelowCutoff: bundle.settings.pointsBelowCutoff,
        }}
        pointsTable={bundle.pointsTable}
        initialEntries={entries}
        isFinal={stage.isFinal}
        accumulatedReserve={accumulatedReserve}
        initialGrossOverride={stage.grossIsManual ? stage.gross : null}
      />
    </>
  );
}
