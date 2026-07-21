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
import { computeReserve } from "./prizes";

export type PlayerType = "socio" | "convidado" | "indefinido";

export interface RankingPlayer {
  id: string;
  fullName: string;
  type: PlayerType;
  memberNumber: string | null;
  invitedByName: string | null;
}

export interface RankingEntry {
  stageId: string;
  playerId: string;
  /** null = participou, colocação exata não registrada (16º ou pior). */
  placement: number | null;
  points: number;
  /** null = valor gasto ainda não informado. */
  amountPaid: number | null;
  prizeAmount: number;
}

export interface RankingRow {
  position: number;
  player: RankingPlayer;
  totalPoints: number;
  stagesPlayed: number;
  totalPaid: number;
  totalReceived: number;
  balance: number;
  /** Média só das etapas em que jogou E teve colocação registrada. */
  averagePlacement: number | null;
  /** Média só das etapas em que jogou. */
  averagePoints: number;
  /** Soma das colocações registradas — para reagregar médias entre temporadas. */
  placementSum: number;
  /** Nº de etapas com colocação registrada (exclui "16º ou pior"). */
  placedStages: number;
  /** Melhor colocação da temporada (menor número). null se nenhuma registrada. */
  bestPlacement: number | null;
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

      if (entry.placement !== null && entry.placement !== undefined) {
        placementSum += entry.placement;
        placementCount += 1;
        if (bestPlacement === null || entry.placement < bestPlacement) {
          bestPlacement = entry.placement;
        }
        if (entry.placement === 1) wins += 1;
        else if (entry.placement === 2) seconds += 1;
        else if (entry.placement === 3) thirds += 1;
      }
    }

    const stagesPlayed = playerEntries.length;

    return {
      position: 0, // preenchido após a ordenação
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
      wins,
      seconds,
      thirds,
      stagesMissingFinancials,
    } satisfies RankingRow;
  });

  rows.sort(compareRankingRows);
  rows.forEach((row, index) => {
    row.position = index + 1;
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
 * Soma a reserva de todas as etapas regulares (a Final não gera reserva nova).
 */
export function accumulatedFinalReserve(
  stages: { gross: number; isFinal: boolean }[],
  finalReservePct: number,
): number {
  const totalCents = stages
    .filter((stage) => !stage.isFinal)
    .reduce((sum, stage) => sum + toCents(computeReserve(stage.gross, finalReservePct)), 0);
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
