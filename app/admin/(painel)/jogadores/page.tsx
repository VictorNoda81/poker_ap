import Link from "next/link";
import { deletePlayer } from "@/app/admin/actions";
import { PlayerForm } from "@/components/admin/player-form";
import { AdminCard, Flash, GhostButton } from "@/components/admin/ui";
import { ErrorNotice, PlayerTypeBadge, SetupNotice } from "@/components/ui/primitives";
import { listPlayers } from "@/lib/db/queries";
import { load } from "@/lib/db/load";
import { formatNumber } from "@/lib/domain/money";

export const dynamic = "force-dynamic";

export const metadata = { title: "Jogadores · Admin" };

type SearchParams = Promise<{ ok?: string; erro?: string; editar?: string }>;

export default async function AdminJogadores({ searchParams }: { searchParams: SearchParams }) {
  const { ok, erro, editar } = await searchParams;
  const result = await load(listPlayers);

  if (result.status === "unconfigured") return <SetupNotice />;
  if (result.status === "error") return <ErrorNotice message={result.message} />;

  const players = result.data;
  const emEdicao = editar ? players.find((p) => p.id === editar) : undefined;
  const indefinidos = players.filter((p) => p.type === "indefinido").length;

  return (
    <>
      <Flash ok={ok} erro={erro} />

      <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
        {/* ---------------------------------------------------------------- */}
        {/* Lista                                                             */}
        {/* ---------------------------------------------------------------- */}
        <AdminCard
          title={`Jogadores (${formatNumber(players.length)})`}
          description={
            indefinidos > 0
              ? `${indefinidos} jogadores ainda não foram classificados como sócio ou convidado.`
              : "Cadastro global: o mesmo jogador é reaproveitado entre temporadas."
          }
        >
          {players.length === 0 ? (
            <p className="py-6 text-center text-sm text-chalk-dim">
              Nenhum jogador cadastrado. Use o formulário ao lado.
            </p>
          ) : (
            <ul className="divide-y divide-ink-850">
              {players.map((player) => (
                <li
                  key={player.id}
                  className={`flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0 ${
                    player.id === editar ? "-mx-2 rounded-lg bg-cap-red/5 px-2" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <Link
                      href={`/jogadores/${player.id}`}
                      className="font-semibold text-chalk transition-colors hover:text-cap-red-light"
                    >
                      {player.fullName}
                    </Link>
                    <div className="mt-1">
                      <PlayerTypeBadge
                        type={player.type}
                        memberNumber={player.memberNumber}
                        invitedByName={player.invitedByName}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Link
                      href={`/admin/jogadores?editar=${player.id}`}
                      className="rounded-lg border border-ink-700 px-3 py-1.5 text-xs font-semibold text-chalk-dim transition-colors hover:border-cap-red hover:text-cap-red-light"
                    >
                      Editar
                    </Link>
                    <form action={deletePlayer}>
                      <input type="hidden" name="id" value={player.id} />
                      <GhostButton type="submit" tone="danger" className="px-3 py-1.5 text-xs">
                        Excluir
                      </GhostButton>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </AdminCard>

        {/* ---------------------------------------------------------------- */}
        {/* Formulário                                                        */}
        {/* ---------------------------------------------------------------- */}
        <AdminCard
          title={emEdicao ? `Editar ${emEdicao.fullName}` : "Novo jogador"}
          description={
            emEdicao ? undefined : "Nome completo e tipo são obrigatórios; o resto é opcional."
          }
        >
          <PlayerForm
            key={emEdicao?.id ?? "novo"}
            values={
              emEdicao
                ? {
                    id: emEdicao.id,
                    fullName: emEdicao.fullName,
                    type: emEdicao.type,
                    memberNumber: emEdicao.memberNumber,
                    invitedByName: emEdicao.invitedByName,
                  }
                : undefined
            }
            onCancelHref={emEdicao ? "/admin/jogadores" : undefined}
          />
        </AdminCard>
      </div>
    </>
  );
}
