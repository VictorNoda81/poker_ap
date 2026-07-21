"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PlayerTypeBadge } from "@/components/ui/primitives";
import { formatBRLSigned, formatNumber } from "@/lib/domain/money";
import type { PlayerAcrossSeasons } from "@/lib/db/queries";

const DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g");

function normalize(text: string): string {
  return text.normalize("NFD").replace(DIACRITICS, "").toLowerCase();
}

type Order = "nome" | "pontos";

interface Aggregate {
  points: number;
  stagesPlayed: number;
  wins: number;
  totalPaid: number;
  totalReceived: number;
  balance: number;
  seasonsPlayed: number;
  bestPosition: number | null;
}

/** Soma as estatísticas do jogador nas temporadas selecionadas. */
function aggregate(player: PlayerAcrossSeasons, years: Set<number>): Aggregate {
  const agg: Aggregate = {
    points: 0,
    stagesPlayed: 0,
    wins: 0,
    totalPaid: 0,
    totalReceived: 0,
    balance: 0,
    seasonsPlayed: 0,
    bestPosition: null,
  };
  for (const stat of Object.values(player.bySeasonYear)) {
    if (!years.has(stat.year)) continue;
    agg.points += stat.points;
    agg.stagesPlayed += stat.stagesPlayed;
    agg.wins += stat.wins;
    agg.totalPaid += stat.totalPaid;
    agg.totalReceived += stat.totalReceived;
    agg.seasonsPlayed += 1;
    agg.bestPosition =
      agg.bestPosition === null ? stat.position : Math.min(agg.bestPosition, stat.position);
  }
  agg.balance = agg.totalReceived - agg.totalPaid;
  return agg;
}

/**
 * Diretório de jogadores com filtro por temporada.
 *
 * Escolha "Todas" para ver o histórico somado, ou marque temporadas específicas
 * (várias ao mesmo tempo). Os números do card são a soma das temporadas
 * selecionadas em que o jogador participou.
 */
export function PlayersDirectory({
  seasons,
  players,
}: {
  seasons: { year: number; name: string }[];
  players: PlayerAcrossSeasons[];
}) {
  const anos = useMemo(() => seasons.map((s) => s.year).sort((a, b) => b - a), [seasons]);

  const [query, setQuery] = useState("");
  const [order, setOrder] = useState<Order>("pontos");
  // Começa com todas as temporadas selecionadas (histórico completo).
  const [selected, setSelected] = useState<Set<number>>(() => new Set(anos));

  const todasMarcadas = selected.size === anos.length;
  const umAnoSo = selected.size === 1 ? [...selected][0] : null;

  function toggleAno(ano: number) {
    setSelected((atual) => {
      // Vindo de "Todas", clicar num ano seleciona SÓ aquele ano (é o que a
      // pessoa espera), em vez de "todos menos ele".
      if (atual.size === anos.length) return new Set([ano]);

      const proximo = new Set(atual);
      if (proximo.has(ano)) proximo.delete(ano);
      else proximo.add(ano);
      // Nunca deixa vazio: sem temporada não haveria o que mostrar.
      return proximo.size === 0 ? new Set(anos) : proximo;
    });
  }

  const linhas = useMemo(() => {
    const needle = normalize(query.trim());
    return players
      .map((player) => ({ player, agg: aggregate(player, selected) }))
      // Só quem participou de ao menos uma temporada selecionada.
      .filter(({ agg }) => agg.seasonsPlayed > 0)
      .filter(({ player }) => !needle || normalize(player.player.fullName).includes(needle))
      .sort((a, b) =>
        order === "nome"
          ? a.player.player.fullName.localeCompare(b.player.player.fullName, "pt-BR")
          : b.agg.points - a.agg.points ||
            a.player.player.fullName.localeCompare(b.player.player.fullName, "pt-BR"),
      );
  }, [players, selected, query, order]);

  return (
    <>
      {/* Filtro de temporadas. */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[0.68rem] font-bold uppercase tracking-[0.14em] text-chalk-dim">
          Temporadas
        </span>
        <button
          type="button"
          onClick={() => setSelected(new Set(anos))}
          aria-pressed={todasMarcadas}
          className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
            todasMarcadas
              ? "border-cap-red bg-cap-red/15 text-cap-red-light"
              : "border-ink-700 text-chalk-dim hover:border-ink-600 hover:text-chalk"
          }`}
        >
          Todas
        </button>
        {anos.map((ano) => {
          const on = !todasMarcadas && selected.has(ano);
          return (
            <button
              key={ano}
              type="button"
              onClick={() => toggleAno(ano)}
              aria-pressed={on}
              className={`tnum rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                on
                  ? "border-cap-red bg-cap-red/15 text-cap-red-light"
                  : "border-ink-700 text-chalk-dim hover:border-ink-600 hover:text-chalk"
              }`}
            >
              {ano}
            </button>
          );
        })}
      </div>

      {/* Busca + ordenação. */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="w-full sm:max-w-xs">
          <span className="sr-only">Buscar jogador pelo nome</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar jogador…"
            className="w-full rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-chalk placeholder:text-chalk-dim/60 focus:border-cap-red focus:outline-none"
          />
        </label>

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-chalk-dim">Ordenar por</span>
          {(["pontos", "nome"] as Order[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setOrder(value)}
              aria-pressed={order === value}
              className={`rounded-full border px-3 py-1 text-xs font-semibold capitalize transition-colors ${
                order === value
                  ? "border-cap-red bg-cap-red/15 text-cap-red-light"
                  : "border-ink-700 text-chalk-dim hover:border-ink-600 hover:text-chalk"
              }`}
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      <p className="mb-4 text-xs text-chalk-dim">
        {formatNumber(linhas.length)} jogadores
        {umAnoSo ? ` · temporada ${umAnoSo}` : todasMarcadas ? " · todas as temporadas" : ` · ${selected.size} temporadas`}
      </p>

      {linhas.length === 0 ? (
        <p className="card px-4 py-10 text-center text-sm text-chalk-dim">
          Nenhum jogador encontrado{query ? ` para “${query}”` : ""}.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {linhas.map(({ player, agg }) => {
            const semFinanceiro = agg.totalPaid === 0 && agg.totalReceived === 0;
            return (
              <li key={player.player.id}>
                <Link
                  href={`/jogadores/${player.player.id}`}
                  className="card flex h-full flex-col gap-2 p-4 transition-colors hover:border-cap-red/40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold leading-tight text-chalk">
                      {player.player.fullName}
                    </span>
                    {/* Colocação só faz sentido quando UMA temporada está selecionada. */}
                    {umAnoSo && agg.bestPosition !== null ? (
                      <span
                        className={`tnum shrink-0 text-sm font-black ${
                          agg.bestPosition === 1
                            ? "text-gold-bright"
                            : agg.bestPosition === 2
                              ? "text-silver"
                              : agg.bestPosition === 3
                                ? "text-bronze"
                                : "text-chalk-dim"
                        }`}
                      >
                        {agg.bestPosition}º
                      </span>
                    ) : (
                      <span className="tnum shrink-0 text-[0.62rem] font-semibold uppercase tracking-wider text-chalk-dim">
                        {agg.seasonsPlayed} {agg.seasonsPlayed === 1 ? "temp." : "temps."}
                      </span>
                    )}
                  </div>

                  <PlayerTypeBadge
                    type={player.player.type}
                    memberNumber={player.player.memberNumber}
                    invitedByName={player.player.invitedByName}
                  />

                  <dl className="mt-auto grid grid-cols-3 gap-2 border-t border-white/5 pt-3 text-center">
                    <div>
                      <dt className="text-[0.58rem] uppercase tracking-wider text-chalk-dim">
                        Pontos
                      </dt>
                      <dd className="tnum mt-0.5 text-sm font-bold text-chalk">
                        {formatNumber(agg.points)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[0.58rem] uppercase tracking-wider text-chalk-dim">
                        Etapas
                      </dt>
                      <dd className="tnum mt-0.5 text-sm font-bold text-chalk">
                        {agg.stagesPlayed}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[0.58rem] uppercase tracking-wider text-chalk-dim">
                        Saldo
                      </dt>
                      <dd
                        className={`tnum mt-0.5 text-sm font-bold ${
                          semFinanceiro
                            ? "text-chalk-dim"
                            : agg.balance > 0
                              ? "text-emerald-400"
                              : agg.balance < 0
                                ? "text-cap-red-light"
                                : "text-chalk-dim"
                        }`}
                      >
                        {semFinanceiro ? "—" : formatBRLSigned(agg.balance)}
                      </dd>
                    </div>
                  </dl>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
