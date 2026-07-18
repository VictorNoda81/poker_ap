import Link from "next/link";
import { deleteStage, saveStage } from "@/app/admin/actions";
import {
  AdminCard,
  Field,
  Flash,
  GhostButton,
  PrimaryButton,
  inputClass,
} from "@/components/admin/ui";
import { TrophyIcon } from "@/components/brand/icons";
import { ErrorNotice, SetupNotice } from "@/components/ui/primitives";
import { getCurrentSeason, getSeasonBundle, listSeasons } from "@/lib/db/queries";
import { load } from "@/lib/db/load";
import { formatBRL } from "@/lib/domain/money";
import { formatShortDate, stageName } from "@/lib/domain/stage-name";

export const dynamic = "force-dynamic";

export const metadata = { title: "Etapas · Admin" };

type SearchParams = Promise<{ ok?: string; erro?: string; temporada?: string }>;

export default async function AdminEtapas({ searchParams }: { searchParams: SearchParams }) {
  const { ok, erro, temporada } = await searchParams;

  const result = await load(async () => {
    const seasons = await listSeasons();
    if (seasons.length === 0) return null;

    const selected =
      seasons.find((s) => s.id === temporada) ?? (await getCurrentSeason()) ?? seasons[0];
    return { seasons, bundle: await getSeasonBundle(selected) };
  });

  if (result.status === "unconfigured") return <SetupNotice />;
  if (result.status === "error") return <ErrorNotice message={result.message} />;

  if (!result.data) {
    return (
      <>
        <Flash ok={ok} erro={erro} />
        <AdminCard title="Nenhuma temporada cadastrada">
          <p className="text-sm text-chalk-dim">
            Crie uma temporada antes de cadastrar etapas.{" "}
            <Link href="/admin/temporadas" className="font-semibold text-cap-red-light">
              Ir para temporadas
            </Link>
          </p>
        </AdminCard>
      </>
    );
  }

  const { seasons, bundle } = result.data;
  const { season, stages } = bundle;
  const proximoNumero = Math.max(0, ...stages.map((s) => s.number)) + 1;

  return (
    <>
      <Flash ok={ok} erro={erro} />

      {/* Seletor de temporada. */}
      {seasons.length > 1 ? (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-[0.14em] text-chalk-dim">
            Temporada
          </span>
          {seasons.map((option) => (
            <Link
              key={option.id}
              href={`/admin/etapas?temporada=${option.id}`}
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

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <AdminCard
          title={`Etapas de ${season.year}`}
          description="Clique em uma etapa para lançar participantes, colocações e premiação."
        >
          {stages.length === 0 ? (
            <p className="py-6 text-center text-sm text-chalk-dim">
              Nenhuma etapa cadastrada nesta temporada.
            </p>
          ) : (
            <ul className="divide-y divide-ink-850">
              {stages.map((stage) => (
                <li
                  key={stage.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/admin/etapas/${stage.id}`}
                      className="inline-flex items-center gap-2 font-bold text-chalk transition-colors hover:text-cap-red-light"
                    >
                      {stage.isFinal ? <TrophyIcon className="h-4 w-4 text-gold" /> : null}
                      {stageName(stage.number, stage.eventDate, stage.isFinal)}
                    </Link>
                    <p className="tnum mt-1 text-xs text-chalk-dim">
                      {formatShortDate(stage.eventDate)} ·{" "}
                      {stage.participantCount === 0
                        ? "sem participantes"
                        : `${stage.participantCount} jogadores`}
                      {stage.gross > 0 ? ` · ${formatBRL(stage.gross)}` : ""}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {stage.status === "scheduled" ? (
                        <Badge>Agendada</Badge>
                      ) : (
                        <Badge tone="ok">Realizada</Badge>
                      )}
                      {stage.isOctoberCutoff ? <Badge tone="info">Corte da Final</Badge> : null}
                      {stage.missingFinancials > 0 ? (
                        <Badge tone="warn">{stage.missingFinancials} sem financeiro</Badge>
                      ) : null}
                      {stage.needsReviewCount > 0 ? (
                        <Badge tone="warn">{stage.needsReviewCount} a revisar</Badge>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Link
                      href={`/admin/etapas/${stage.id}`}
                      className="rounded-lg border border-ink-700 px-3 py-1.5 text-xs font-semibold text-chalk-dim transition-colors hover:border-cap-red hover:text-cap-red-light"
                    >
                      Lançar
                    </Link>
                    {stage.participantCount === 0 ? (
                      <form action={deleteStage}>
                        <input type="hidden" name="id" value={stage.id} />
                        <GhostButton type="submit" tone="danger" className="px-3 py-1.5 text-xs">
                          Excluir
                        </GhostButton>
                      </form>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </AdminCard>

        <AdminCard
          title="Nova etapa"
          description="O nome é gerado automaticamente a partir do número e da data."
        >
          <form action={saveStage} className="space-y-4">
            <input type="hidden" name="temporada" value={season.id} />

            <Field label="Número da etapa" htmlFor="numero">
              <input
                id="numero"
                name="numero"
                type="number"
                min={1}
                defaultValue={proximoNumero}
                required
                className={inputClass}
              />
            </Field>

            <Field label="Data" htmlFor="data" hint="O mês da data define o nome: “Jul/26”.">
              <input id="data" name="data" type="date" required className={inputClass} />
            </Field>

            <label className="flex items-start gap-2.5 text-sm text-chalk-dim">
              <input
                type="checkbox"
                name="corte"
                className="mt-0.5 h-4 w-4 rounded border-ink-600 bg-ink-950 accent-cap-red"
              />
              <span>
                Etapa de corte para a Final
                <span className="mt-0.5 block text-xs text-chalk-dim/70">
                  Normalmente a de Outubro: define os 20 primeiros convidados.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-2.5 text-sm text-chalk-dim">
              <input
                type="checkbox"
                name="final"
                className="mt-0.5 h-4 w-4 rounded border-ink-600 bg-ink-950 accent-cap-red"
              />
              <span>
                É a Etapa Final
                <span className="mt-0.5 block text-xs text-chalk-dim/70">
                  Distribui a reserva acumulada e não separa 10%.
                </span>
              </span>
            </label>

            <PrimaryButton>Criar etapa</PrimaryButton>
          </form>
        </AdminCard>
      </div>
    </>
  );
}

function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "ok" | "info" | "warn";
}) {
  const toneClass =
    tone === "ok"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
      : tone === "warn"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
        : tone === "info"
          ? "border-sky-500/30 bg-sky-500/10 text-sky-300"
          : "border-ink-700 bg-ink-850 text-chalk-dim";

  return (
    <span className={`rounded-full border px-2 py-0.5 text-[0.6rem] font-semibold ${toneClass}`}>
      {children}
    </span>
  );
}
