"use client";

import { useMemo, useState } from "react";
import { saveFinalInvitees } from "@/app/admin/actions";
import { GhostButton, PrimaryButton, inputClass } from "@/components/admin/ui";
import { formatNumber } from "@/lib/domain/money";
import type { RankingRow } from "@/lib/domain/ranking";

const DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g");

function normalize(text: string): string {
  return text.normalize("NFD").replace(DIACRITICS, "").toLowerCase();
}

interface Invitee {
  playerId: string;
  source: "auto" | "manual";
  rank: number | null;
}

/**
 * Montagem da lista de convidados da Etapa Final.
 *
 * A regra da liga convida os N primeiros do ranking após a etapa de Outubro,
 * mas quem não puder ir é substituído pelo próximo colocado. Por isso a lista
 * sugerida é só um ponto de partida: o admin adiciona e remove quem quiser.
 */
export function FinalInviteesEditor({
  stageId,
  ranking,
  suggested,
  initial,
  inviteCount,
}: {
  stageId: string;
  /** Ranking até a etapa de corte, na ordem de classificação. */
  ranking: RankingRow[];
  /** Ids sugeridos automaticamente (os N primeiros). */
  suggested: string[];
  /** Lista já salva, se houver. */
  initial: Invitee[];
  inviteCount: number;
}) {
  const suggestedSet = useMemo(() => new Set(suggested), [suggested]);

  const [invitees, setInvitees] = useState<Invitee[]>(() =>
    initial.length > 0
      ? initial
      : suggested.map((playerId) => ({
          playerId,
          source: "auto" as const,
          rank: ranking.find((row) => row.player.id === playerId)?.position ?? null,
        })),
  );
  const [search, setSearch] = useState("");

  const rowsById = useMemo(
    () => new Map(ranking.map((row) => [row.player.id, row])),
    [ranking],
  );

  const chosen = useMemo(() => new Set(invitees.map((i) => i.playerId)), [invitees]);

  const available = useMemo(() => {
    const needle = normalize(search.trim());
    return ranking
      .filter((row) => !chosen.has(row.player.id))
      .filter((row) => !needle || normalize(row.player.fullName).includes(needle))
      .slice(0, needle ? 50 : 25);
  }, [ranking, chosen, search]);

  function add(playerId: string) {
    setInvitees((current) => [
      ...current,
      {
        playerId,
        // Entrou fora da faixa automática = convite manual (substituto).
        source: suggestedSet.has(playerId) ? "auto" : "manual",
        rank: rowsById.get(playerId)?.position ?? null,
      },
    ]);
  }

  function remove(playerId: string) {
    setInvitees((current) => current.filter((i) => i.playerId !== playerId));
  }

  function resetToSuggested() {
    setInvitees(
      suggested.map((playerId) => ({
        playerId,
        source: "auto" as const,
        rank: rowsById.get(playerId)?.position ?? null,
      })),
    );
  }

  return (
    <form action={saveFinalInvitees} className="space-y-5">
      <input type="hidden" name="etapa" value={stageId} />
      <input type="hidden" name="convidados" value={JSON.stringify(invitees)} />

      <section className="card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-chalk">
              Convidados ({formatNumber(invitees.length)})
            </h2>
            <p className="mt-1 text-sm text-chalk-dim">
              Sugestão automática: os {inviteCount} primeiros do ranking até a etapa de corte.
            </p>
          </div>
          <GhostButton onClick={resetToSuggested} className="px-3 py-1.5 text-xs">
            Restaurar sugestão
          </GhostButton>
        </div>

        {invitees.length === 0 ? (
          <p className="py-6 text-center text-sm text-chalk-dim">
            Nenhum convidado na lista. Adicione jogadores abaixo.
          </p>
        ) : (
          <ol className="divide-y divide-ink-850">
            {invitees.map((invitee, index) => {
              const row = rowsById.get(invitee.playerId);
              return (
                <li
                  key={invitee.playerId}
                  className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="tnum w-6 shrink-0 text-sm font-bold text-chalk-dim">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-chalk">
                        {row?.player.fullName ?? "Jogador"}
                      </p>
                      <p className="tnum text-xs text-chalk-dim">
                        {invitee.rank !== null ? `${invitee.rank}º no ranking` : "fora do ranking"}
                        {row ? ` · ${formatNumber(row.totalPoints)} pts` : ""}
                        {invitee.source === "manual" ? " · convite manual" : ""}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => remove(invitee.playerId)}
                    className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-chalk-dim transition-colors hover:text-cap-red-light"
                  >
                    remover
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section className="card p-5">
        <h2 className="mb-3 text-base font-bold text-chalk">Adicionar jogador</h2>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar pelo nome…"
          className={inputClass}
        />

        {available.length > 0 ? (
          <div className="mt-3 flex max-h-52 flex-wrap gap-1.5 overflow-y-auto">
            {available.map((row) => (
              <button
                key={row.player.id}
                type="button"
                onClick={() => add(row.player.id)}
                className="rounded-full border border-ink-700 bg-ink-900 px-3 py-1 text-xs font-semibold text-chalk-dim transition-colors hover:border-cap-red hover:text-cap-red-light"
              >
                + {row.player.fullName}
                <span className="ml-1.5 tnum text-chalk-dim/60">{row.position}º</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-xs text-chalk-dim">Nenhum jogador disponível com esse nome.</p>
        )}
      </section>

      <PrimaryButton>Salvar lista de convidados</PrimaryButton>
    </form>
  );
}
