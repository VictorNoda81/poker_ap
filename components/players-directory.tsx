"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PlayerTypeBadge } from "@/components/ui/primitives";
import { formatBRL, formatBRLSigned, formatNumber } from "@/lib/domain/money";
import type { PlayerAcrossSeasons } from "@/lib/db/queries";

const DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g");

function normalize(text: string): string {
  return text.normalize("NFD").replace(DIACRITICS, "").toLowerCase();
}

type Order = "nome" | "pontos" | "media" | "classificacao" | "vitorias" | "melhor";

const ORDER_LABELS: Record<Order, string> = {
  nome: "Nome",
  pontos: "Pontos",
  media: "Média pts",
  classificacao: "Class. média",
  vitorias: "Vitórias",
  melhor: "Melhor col.",
};

interface Aggregate {
  points: number;
  stagesPlayed: number;
  wins: number;
  totalPaid: number;
  totalReceived: number;
  balance: number;
  seasonsPlayed: number;
  bestPosition: number | null;
  /** Melhor colocação numa ETAPA e quantas vezes a atingiu. */
  bestStagePlacement: number | null;
  bestStagePlacementCount: number;
  /** Temporadas em que foi campeão (só conta temporada encerrada). */
  championSeasons: number[];
  /** Etapas sem o valor gasto lançado — enquanto houver, o saldo não fecha. */
  stagesMissingFinancials: number;
  /** Pontos por etapa jogada, no conjunto de temporadas selecionado. */
  avgPoints: number;
  /** Colocação média por etapa com posição registrada. null se nenhuma. */
  avgPlacement: number | null;
}

/**
 * Soma as estatísticas do jogador nas temporadas selecionadas.
 *
 * As MÉDIAS são recalculadas a partir das somas brutas (pontos/etapas e
 * soma-de-colocações/etapas-colocadas) — nunca a média das médias, que daria
 * peso errado a temporadas com menos etapas.
 */
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
    bestStagePlacement: null,
    bestStagePlacementCount: 0,
    championSeasons: [],
    stagesMissingFinancials: 0,
    avgPoints: 0,
    avgPlacement: null,
  };
  let placementSum = 0;
  let placedStages = 0;
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
    placementSum += stat.placementSum;
    placedStages += stat.placedStages;
    agg.stagesMissingFinancials += stat.stagesMissingFinancials;

    if (stat.isChampion) agg.championSeasons.push(stat.year);

    // Melhor colocação numa etapa: guarda a menor e soma as repetições dela.
    if (stat.bestPlacement !== null) {
      if (agg.bestStagePlacement === null || stat.bestPlacement < agg.bestStagePlacement) {
        agg.bestStagePlacement = stat.bestPlacement;
        agg.bestStagePlacementCount = stat.bestPlacementCount;
      } else if (stat.bestPlacement === agg.bestStagePlacement) {
        agg.bestStagePlacementCount += stat.bestPlacementCount;
      }
    }
  }
  agg.balance = agg.totalReceived - agg.totalPaid;
  agg.avgPoints = agg.stagesPlayed > 0 ? agg.points / agg.stagesPlayed : 0;
  agg.avgPlacement = placedStages > 0 ? placementSum / placedStages : null;
  return agg;
}

type Linha = { player: PlayerAcrossSeasons; agg: Aggregate };

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
  showFinances = true,
}: {
  seasons: { year: number; name: string }[];
  players: PlayerAcrossSeasons[];
  showFinances?: boolean;
}) {
  const anos = useMemo(() => seasons.map((s) => s.year).sort((a, b) => b - a), [seasons]);

  const [query, setQuery] = useState("");
  const [order, setOrder] = useState<Order>("nome");
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
    const porNome = (a: Linha, b: Linha) =>
      a.player.player.fullName.localeCompare(b.player.player.fullName, "pt-BR");

    return players
      .map((player) => ({ player, agg: aggregate(player, selected) }))
      // Só quem participou de ao menos uma temporada selecionada.
      .filter(({ agg }) => agg.seasonsPlayed > 0)
      .filter(({ player }) => !needle || normalize(player.player.fullName).includes(needle))
      .sort((a, b) => {
        switch (order) {
          case "nome":
            return porNome(a, b);
          case "media":
            // Mais pontos por etapa primeiro.
            return b.agg.avgPoints - a.agg.avgPoints || porNome(a, b);
          case "classificacao": {
            // Melhor (menor) colocação média primeiro; sem colocação vai ao fim.
            const av = a.agg.avgPlacement ?? Number.POSITIVE_INFINITY;
            const bv = b.agg.avgPlacement ?? Number.POSITIVE_INFINITY;
            return av - bv || porNome(a, b);
          }
          case "vitorias":
            return b.agg.wins - a.agg.wins || porNome(a, b);
          case "melhor": {
            // Melhor colocação numa etapa; empate desempata por quem repetiu mais.
            const av = a.agg.bestStagePlacement ?? Number.POSITIVE_INFINITY;
            const bv = b.agg.bestStagePlacement ?? Number.POSITIVE_INFINITY;
            return (
              av - bv ||
              b.agg.bestStagePlacementCount - a.agg.bestStagePlacementCount ||
              porNome(a, b)
            );
          }
          default: // pontos
            return b.agg.points - a.agg.points || porNome(a, b);
        }
      });
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

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-chalk-dim">Ordenar por</span>
          {(
            ["nome", "pontos", "media", "classificacao", "vitorias", "melhor"] as Order[]
          ).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setOrder(value)}
              aria-pressed={order === value}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                order === value
                  ? "border-cap-red bg-cap-red/15 text-cap-red-light"
                  : "border-ink-700 text-chalk-dim hover:border-ink-600 hover:text-chalk"
              }`}
            >
              {ORDER_LABELS[value]}
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
            // Saldo com o que já foi lançado; "—" só quando não há gasto algum.
            const semFinanceiro = agg.totalPaid === 0;
            return (
              <li key={player.player.id}>
                <Link
                  href={`/jogadores/${player.player.id}`}
                  className="card flex h-full flex-col gap-2 p-4 transition-colors hover:border-cap-red/40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5 font-semibold leading-tight text-chalk">
                      <span className="truncate">{player.player.fullName}</span>
                      {/* Estrela = já foi campeão de alguma temporada encerrada. */}
                      {agg.championSeasons.length > 0 ? (
                        <span
                          title={`Campeão da temporada ${agg.championSeasons.sort().join(", ")}`}
                          aria-label={`Campeão em ${agg.championSeasons.sort().join(", ")}`}
                          className="shrink-0 text-gold-bright"
                        >
                          ★
                          {agg.championSeasons.length > 1 ? (
                            <span className="tnum text-[0.65rem] font-bold">
                              {agg.championSeasons.length}
                            </span>
                          ) : null}
                        </span>
                      ) : null}
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
                    {/* Com finanças ocultas, mostra o Prêmio (o que ganhou) no
                        lugar do Saldo — este revela o gasto. */}
                    {showFinances ? (
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
                    ) : (
                      <div>
                        <dt className="text-[0.58rem] uppercase tracking-wider text-chalk-dim">
                          Prêmio
                        </dt>
                        <dd className="tnum mt-0.5 text-sm font-bold text-gold">
                          {agg.totalReceived === 0 ? "—" : formatBRL(agg.totalReceived)}
                        </dd>
                      </div>
                    )}
                  </dl>

                  {/* Médias por etapa jogada. */}
                  <dl className="grid grid-cols-2 gap-2 border-t border-white/5 pt-3 text-center">
                    <div>
                      <dt className="text-[0.58rem] uppercase tracking-wider text-chalk-dim">
                        Média pts
                      </dt>
                      <dd className="tnum mt-0.5 text-sm font-bold text-chalk">
                        {formatNumber(agg.avgPoints, 1)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[0.58rem] uppercase tracking-wider text-chalk-dim">
                        Class. média
                      </dt>
                      <dd className="tnum mt-0.5 text-sm font-bold text-chalk">
                        {agg.avgPlacement === null ? "—" : `${formatNumber(agg.avgPlacement, 1)}º`}
                      </dd>
                    </div>
                  </dl>

                  {/* Conquistas em etapas. */}
                  <dl className="grid grid-cols-2 gap-2 border-t border-white/5 pt-3 text-center">
                    <div>
                      <dt className="text-[0.58rem] uppercase tracking-wider text-chalk-dim">
                        Etapas vencidas
                      </dt>
                      <dd
                        className={`tnum mt-0.5 text-sm font-bold ${
                          agg.wins > 0 ? "text-gold-bright" : "text-chalk-dim"
                        }`}
                      >
                        {agg.wins || "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[0.58rem] uppercase tracking-wider text-chalk-dim">
                        Melhor colocação
                      </dt>
                      <dd className="tnum mt-0.5 text-sm font-bold text-chalk">
                        {agg.bestStagePlacement === null ? (
                          "—"
                        ) : (
                          <>
                            {agg.bestStagePlacement}º
                            {agg.bestStagePlacementCount > 1 ? (
                              <span className="text-chalk-dim"> ×{agg.bestStagePlacementCount}</span>
                            ) : null}
                          </>
                        )}
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
