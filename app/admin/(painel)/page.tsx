import Link from "next/link";
import { TrophyIcon } from "@/components/brand/icons";
import { Flash } from "@/components/admin/ui";
import { ErrorNotice, SetupNotice, StatCard } from "@/components/ui/primitives";
import { getCurrentSeason, getSeasonBundle } from "@/lib/db/queries";
import { load } from "@/lib/db/load";
import { formatBRL, formatNumber } from "@/lib/domain/money";
import { formatShortDate, stageName } from "@/lib/domain/stage-name";

export const dynamic = "force-dynamic";

export const metadata = { title: "Painel" };

const ATALHOS = [
  { href: "/admin/etapas", titulo: "Lançar etapa", texto: "Participantes, colocações e premiação." },
  { href: "/admin/jogadores", titulo: "Jogadores", texto: "Cadastrar e classificar sócios e convidados." },
  { href: "/admin/configuracoes", titulo: "Configurações", texto: "Pontuação, buy-in e regras de premiação." },
  { href: "/admin/final", titulo: "Etapa Final", texto: "Montar a lista de convidados." },
];

export default async function AdminHome({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erro?: string }>;
}) {
  const { ok, erro } = await searchParams;

  const result = await load(async () => {
    const season = await getCurrentSeason();
    if (!season) return null;
    return getSeasonBundle(season);
  });

  if (result.status === "unconfigured") return <SetupNotice />;
  if (result.status === "error") return <ErrorNotice message={result.message} />;

  const bundle = result.data;

  if (!bundle) {
    return (
      <>
        <Flash ok={ok} erro={erro} />
        <div className="card p-6">
          <h1 className="text-lg font-bold text-chalk">Nenhuma temporada cadastrada</h1>
          <p className="mt-2 text-sm text-chalk-dim">
            Comece criando a temporada atual. Depois cadastre as etapas e lance os resultados.
          </p>
          <Link
            href="/admin/temporadas"
            className="mt-4 inline-block rounded-lg bg-cap-red px-4 py-2 text-sm font-bold text-white hover:bg-cap-red-dark"
          >
            Criar temporada
          </Link>
        </div>
      </>
    );
  }

  const { season, stages, ranking, accumulatedReserve, totals } = bundle;
  const aRevisar = stages.reduce((sum, s) => sum + s.needsReviewCount, 0);
  const semFinanceiro = stages.filter((s) => s.missingFinancials > 0);
  const proxima = stages.find((s) => s.status === "scheduled");
  const lider = ranking.find((row) => row.stagesPlayed > 0);

  return (
    <>
      <Flash ok={ok} erro={erro} />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-extrabold text-chalk">{season.name}</h1>
        {proxima ? (
          <Link
            href={`/admin/etapas/${proxima.id}`}
            className="rounded-lg bg-cap-red px-4 py-2 text-sm font-bold text-white hover:bg-cap-red-dark"
          >
            Lançar {stageName(proxima.number, proxima.eventDate, proxima.isFinal)}
          </Link>
        ) : null}
      </div>

      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Etapas realizadas"
          value={`${stages.filter((s) => s.status === "completed").length}/${stages.length}`}
          hint={proxima ? `Próxima em ${formatShortDate(proxima.eventDate)}` : "Nenhuma agendada"}
        />
        <StatCard
          label="Líder"
          value={lider ? lider.player.fullName.split(" ")[0] : "—"}
          hint={lider ? `${formatNumber(lider.totalPoints)} pontos` : undefined}
          tone="gold"
          icon={<TrophyIcon className="h-5 w-5" />}
        />
        <StatCard label="Arrecadação" value={formatBRL(totals.gross)} />
        <StatCard label="Pote da Final" value={formatBRL(accumulatedReserve)} tone="gold" />
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Pendências                                                          */}
      {/* ------------------------------------------------------------------ */}
      {(aRevisar > 0 || semFinanceiro.length > 0) && (
        <section className="card mb-6 border-amber-500/30 bg-amber-500/5 p-5">
          <h2 className="text-sm font-bold text-amber-300">Pendências</h2>
          <ul className="mt-3 space-y-2 text-sm text-chalk-dim">
            {aRevisar > 0 ? (
              <li>
                <strong className="text-chalk">{aRevisar} participações</strong> importadas da
                planilha ficaram com colocação ambígua e precisam de conferência.
              </li>
            ) : null}
            {semFinanceiro.length > 0 ? (
              <li>
                <strong className="text-chalk">{semFinanceiro.length} etapas</strong> estão sem o
                valor gasto por jogador — a planilha só trazia o total do pote. Abra cada uma e use
                o lançamento retroativo:
                <span className="mt-2 flex flex-wrap gap-1.5">
                  {semFinanceiro.map((stage) => (
                    <Link
                      key={stage.id}
                      href={`/admin/etapas/${stage.id}`}
                      className="rounded-full border border-ink-700 bg-ink-900 px-2.5 py-1 text-xs font-semibold text-chalk transition-colors hover:border-cap-red hover:text-cap-red-light"
                    >
                      {stageName(stage.number, stage.eventDate, stage.isFinal)}
                      <span className="ml-1.5 text-chalk-dim">{stage.missingFinancials}</span>
                    </Link>
                  ))}
                </span>
              </li>
            ) : null}
          </ul>
        </section>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {ATALHOS.map((atalho) => (
          <Link
            key={atalho.href}
            href={atalho.href}
            className="card p-4 transition-colors hover:border-cap-red/40"
          >
            <p className="font-bold text-chalk">{atalho.titulo}</p>
            <p className="mt-1 text-sm text-chalk-dim">{atalho.texto}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
