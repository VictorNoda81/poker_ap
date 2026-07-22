/**
 * Ranking da temporada e estatísticas por jogador.
 *
 * Definições que orientam todos os números desta tela:
 *   PAGO       = quanto o jogador GASTOU (buy-in + re-buys + add-on)
 *   ARRECADADO = quanto o jogador RECEBEU de premiação
 *   SALDO      = arrecadado − pago  (positivo = lucro)
 *
 * Desempate, nesta ordem:
 *   1. mais pontos
 *   2. mais etapas vencidas (1º lugar)
 *   3. mais 2º lugares
 *   4. mais 3º lugares
 *   5. melhor colocação individual na temporada
 *   6. nome em ordem alfabética (critério final, determinístico)
 */

import { fromCents, round2, toCents } from "./money";
import { CUTOFF_PLACEMENT } from "./scoring";

export type PlayerType = "socio" | "convidado" | "indefinido";

export interface RankingPlayer {
  id: string;
  fullName: string;
  type: PlayerType;
  memberNumber: string | null;
  invitedByName: string | null;
}

/**
 * Preenche a colocação real de cada participação a partir da pontuação da etapa:
 * quantos fizeram MAIS pontos naquela etapa, + 1.
 *
 * Por que deduzir em vez de ler a coluna do banco: a planilha só registrava
 * posição até o corte — abaixo dele todo mundo recebe a mesma pontuação e a
 * posição ficava em branco. Essas etapas então sumiam das estatísticas, e quem
 * foi 5º uma vez e mal nas outras aparecia com classificação média 5,0.
 *
 * Empate em pontos = mesma colocação, e a seguinte pula (1, 2, 2, 4). É o único
 * critério que os dados oferecem: abaixo do corte ninguém anotou quem caiu antes.
 */
export function derivePlacements<
  T extends { stageId: string; points: number; placement?: number | null },
>(entries: readonly T[]): (T & { placement: number })[] {
  const pontosPorEtapa = new Map<string, number[]>();
  for (const e of entries) {
    const lista = pontosPorEtapa.get(e.stageId) ?? [];
    lista.push(e.points);
    pontosPorEtapa.set(e.stageId, lista);
  }
  return entries.map((e) => ({
    ...e,
    // Exceção: uma colocação registrada ABAIXO do corte só pode ter sido
    // digitada por quem viu a mesa (a pontuação não a revela), então ela vence
    // a dedução. Serve para as etapas em que a liga anotar a ordem completa.
    placement:
      e.placement != null && e.placement >= CUTOFF_PLACEMENT
        ? e.placement
        : (pontosPorEtapa.get(e.stageId) ?? []).filter((p) => p > e.points).length + 1,
  }));
}

export interface RankingEntry {
  stageId: string;
  playerId: string;
  /**
   * Colocação REAL na etapa. Quem terminou abaixo do corte não tinha posição
   * registrada na planilha (todos pontuam igual), então ela é deduzida da
   * pontuação da etapa — e entra normalmente nas médias.
   */
  placement: number;
  points: number;
  /** null = valor gasto ainda não informado. */
  amountPaid: number | null;
  prizeAmount: number;
}

export interface RankingRow {
  /** Ordem na lista (1..N, sempre única — usada para o pódio e a ordenação). */
  position: number;
  /**
   * Colocação EXIBIDA: quem tem a mesma pontuação divide a mesma colocação, e a
   * seguinte PULA as posições ocupadas pelo empate — 1, 2, 2, 4 (padrão
   * esportivo). Com três empatados em 2º fica 1, 2, 2, 2, 5.
   */
  displayPosition: number;
  player: RankingPlayer;
  totalPoints: number;
  stagesPlayed: number;
  totalPaid: number;
  totalReceived: number;
  balance: number;
  /** Média da colocação em TODAS as etapas que jogou. */
  averagePlacement: number | null;
  /** Média só das etapas em que jogou. */
  averagePoints: number;
  /** Soma das colocações — para reagregar médias entre temporadas. */
  placementSum: number;
  /** Nº de etapas com colocação (hoje, todas as jogadas). */
  placedStages: number;
  /** Melhor colocação da temporada (menor número). null se não jogou. */
  bestPlacement: number | null;
  /** Quantas vezes o jogador atingiu essa melhor colocação. */
  bestPlacementCount: number;
  wins: number;
  seconds: number;
  thirds: number;
  /** Quantas etapas do jogador ainda estão sem o valor gasto preenchido. */
  stagesMissingFinancials: number;
}

/**
 * Monta o ranking completo da temporada.
 *
 * Jogadores sem nenhuma participação entram com zero em tudo, no fim da lista —
 * assim quem foi cadastrado mas ainda não jogou continua visível.
 */
export function buildRanking(
  players: RankingPlayer[],
  entries: RankingEntry[],
): RankingRow[] {
  const byPlayer = new Map<string, RankingEntry[]>();
  for (const entry of entries) {
    const list = byPlayer.get(entry.playerId);
    if (list) list.push(entry);
    else byPlayer.set(entry.playerId, [entry]);
  }

  const rows = players.map((player) => {
    const playerEntries = byPlayer.get(player.id) ?? [];

    let totalPoints = 0;
    let totalPaid = 0;
    let totalReceived = 0;
    let placementSum = 0;
    let placementCount = 0;
    let bestPlacement: number | null = null;
    let wins = 0;
    let seconds = 0;
    let thirds = 0;
    let stagesMissingFinancials = 0;

    for (const entry of playerEntries) {
      totalPoints += entry.points;
      totalReceived += entry.prizeAmount ?? 0;

      if (entry.amountPaid === null || entry.amountPaid === undefined) {
        stagesMissingFinancials += 1;
      } else {
        totalPaid += entry.amountPaid;
      }

      placementSum += entry.placement;
      placementCount += 1;
      if (bestPlacement === null || entry.placement < bestPlacement) {
        bestPlacement = entry.placement;
      }
      if (entry.placement === 1) wins += 1;
      else if (entry.placement === 2) seconds += 1;
      else if (entry.placement === 3) thirds += 1;
    }

    const stagesPlayed = playerEntries.length;
    // Quantas vezes repetiu a melhor colocação (ex.: "3º lugar, 4 vezes").
    const bestPlacementCount =
      bestPlacement === null
        ? 0
        : playerEntries.filter((e) => e.placement === bestPlacement).length;

    return {
      position: 0, // preenchido após a ordenação
      displayPosition: 0, // idem
      player,
      totalPoints,
      stagesPlayed,
      totalPaid: round2(totalPaid),
      totalReceived: round2(totalReceived),
      balance: round2(totalReceived - totalPaid),
      averagePlacement: placementCount > 0 ? placementSum / placementCount : null,
      averagePoints: stagesPlayed > 0 ? totalPoints / stagesPlayed : 0,
      placementSum,
      placedStages: placementCount,
      bestPlacement,
      bestPlacementCount,
      wins,
      seconds,
      thirds,
      stagesMissingFinancials,
    } satisfies RankingRow;
  });

  rows.sort(compareRankingRows);

  rows.forEach((row, index) => {
    row.position = index + 1;
    // Colocação exibida: quantos jogadores fizeram MAIS pontos, + 1. Empate
    // divide a colocação e a seguinte pula (1, 2, 2, 4). Quem não jogou fica
    // fora da classificação.
    row.displayPosition =
      row.stagesPlayed === 0
        ? 0
        : rows.filter((other) => other.stagesPlayed > 0 && other.totalPoints > row.totalPoints)
            .length + 1;
  });

  return rows;
}

/** Comparador do desempate. Exportado para poder ser testado isoladamente. */
export function compareRankingRows(a: RankingRow, b: RankingRow): number {
  if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
  if (b.wins !== a.wins) return b.wins - a.wins;
  if (b.seconds !== a.seconds) return b.seconds - a.seconds;
  if (b.thirds !== a.thirds) return b.thirds - a.thirds;

  // Melhor colocação: menor número vence. Quem não tem nenhuma colocação
  // registrada fica atrás de quem tem.
  const aBest = a.bestPlacement ?? Number.POSITIVE_INFINITY;
  const bBest = b.bestPlacement ?? Number.POSITIVE_INFINITY;
  if (aBest !== bBest) return aBest - bBest;

  return a.player.fullName.localeCompare(b.player.fullName, "pt-BR");
}

/**
 * Reserva acumulada da temporada para a Etapa Final.
 *
 * Recebe a reserva JÁ CALCULADA de cada etapa (a conta depende de custos e do
 * número de jogadores, que são da etapa, não do ranking). A Etapa Final não
 * gera reserva nova — ela distribui o acumulado.
 */
export function accumulatedFinalReserve(stages: { reserve: number; isFinal: boolean }[]): number {
  const totalCents = stages
    .filter((stage) => !stage.isFinal)
    .reduce((sum, stage) => sum + toCents(stage.reserve), 0);
  return fromCents(totalCents);
}

/**
 * Os N primeiros do ranking considerando apenas as etapas até a data de corte
 * (a etapa de Outubro). É a sugestão de convidados da Etapa Final — o admin
 * edita livremente a partir daí.
 */
export function suggestFinalInvitees(
  players: RankingPlayer[],
  entries: RankingEntry[],
  stageIdsUpToCutoff: string[],
  count: number,
): RankingRow[] {
  const allowed = new Set(stageIdsUpToCutoff);
  const filtered = entries.filter((entry) => allowed.has(entry.stageId));
  return buildRanking(players, filtered)
    .filter((row) => row.stagesPlayed > 0)
    .slice(0, count);
}
