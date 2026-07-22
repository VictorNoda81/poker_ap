/**
 * Premiação da etapa.
 *
 * A cascata da liga, na ordem:
 *
 *   arrecadação (tudo que os jogadores gastaram)
 *     ├─ taxa de administração ..... valor fixo POR JOGADOR (R$ 60 × jogadores)
 *     ├─ outros custos ............. troféu, garçons, etc. (informado na etapa)
 *     ├─ prêmio do 5º lugar ........ inscrição + 1 add-on (R$ 160 + R$ 150)
 *     └─ base da reserva
 *          ├─ 10% ................. acumula para o Pote da Etapa Final
 *          └─ distribuível ........ 1º 42% · 2º 27% · 3º 18% · 4º 13%
 *
 * Tudo em centavos inteiros: em reais com float, a soma dos prêmios fecha em
 * 6650,999999 e o aviso de "não bate com a arrecadação" dispara sem motivo.
 */

import { fromCents, round2, toCents } from "./money";

export interface PrizeSettings {
  /** Percentual da base reservado para a Etapa Final (10 = 10%). */
  finalReservePct: number;
  /** Percentuais do distribuível para 1º a 4º. Somam 100. */
  firstPct: number;
  secondPct: number;
  thirdPct: number;
  fourthPct: number;
  /** O 5º lugar leva inscrição + 1 add-on. */
  buyin: number;
  addon: number;
  /** Taxa de administração cobrada por jogador. */
  adminFeePerPlayer: number;
}

export const DEFAULT_PRIZE_SETTINGS: PrizeSettings = {
  finalReservePct: 10,
  firstPct: 42,
  secondPct: 27,
  thirdPct: 18,
  fourthPct: 13,
  buyin: 160,
  addon: 150,
  adminFeePerPlayer: 60,
};

export interface StageCosts {
  /** Arrecadação total da etapa. */
  gross: number;
  /** Quantos jogadores participaram (base da taxa de administração). */
  participants: number;
  /** Taxa por jogador desta etapa. Ausente = usa a da temporada. */
  adminFeePerPlayer?: number | null;
  /** Outros custos da etapa (troféu, garçons...). */
  otherCosts?: number;
}

export interface PrizeBreakdown {
  gross: number;
  /** Taxa por jogador × jogadores. */
  adminFeeTotal: number;
  otherCosts: number;
  /** Prêmio do 5º lugar (0 quando não houve 5º colocado). */
  fifthPrize: number;
  /** Arrecadação menos as três deduções — é sobre isto que incidem os 10%. */
  reserveBase: number;
  reserve: number;
  /** O que sobra para dividir entre 1º e 4º. */
  distributable: number;
  /** Sugestão por colocação, já arredondada (inclui o 5º). */
  byPlacement: { placement: number; amount: number }[];
  /** Soma paga aos jogadores (1º ao 5º). */
  totalPrizes: number;
  /**
   * true quando as deduções passam da arrecadação — a etapa não fecha e o
   * admin precisa ajustar os custos ou a premiação na mão.
   */
  shortfall: boolean;
}

/** Percentual de cada colocação premiada por percentual (1º a 4º). */
function pctOf(settings: PrizeSettings, placement: number): number {
  if (placement === 1) return settings.firstPct;
  if (placement === 2) return settings.secondPct;
  if (placement === 3) return settings.thirdPct;
  if (placement === 4) return settings.fourthPct;
  return 0;
}

/**
 * Monta a sugestão de premiação de uma etapa.
 *
 * `availablePlacements` lida com etapas pequenas: colocação que não existe não
 * é premiada, e o percentual dela é redistribuído proporcionalmente entre as
 * que existem — assim o distribuível é sempre pago por inteiro.
 */
export function suggestStagePrizes(
  costs: StageCosts,
  settings: PrizeSettings = DEFAULT_PRIZE_SETTINGS,
  availablePlacements: number[] = [1, 2, 3, 4, 5],
): PrizeBreakdown {
  const available = new Set(availablePlacements);

  const grossCents = toCents(costs.gross);
  const feePerPlayer = costs.adminFeePerPlayer ?? settings.adminFeePerPlayer;
  const adminCents = Math.round(toCents(feePerPlayer) * Math.max(0, costs.participants));
  const otherCents = toCents(costs.otherCosts ?? 0);
  const fifthCents = available.has(5) ? toCents(settings.buyin) + toCents(settings.addon) : 0;

  const baseBruta = grossCents - adminCents - otherCents - fifthCents;
  const shortfall = baseBruta < 0;
  const baseCents = shortfall ? 0 : baseBruta;

  const reserveCents = Math.round((baseCents * settings.finalReservePct) / 100);
  const distCents = baseCents - reserveCents;

  // 1º a 4º: reparte o distribuível pelos percentuais presentes, normalizados.
  const premiados = [1, 2, 3, 4].filter((p) => available.has(p) && pctOf(settings, p) > 0);
  const somaPct = premiados.reduce((s, p) => s + pctOf(settings, p), 0);

  const byPlacement: { placement: number; amount: number }[] = [];
  let alocado = 0;

  premiados.forEach((placement, indice) => {
    // O último recebe o resto, para a soma fechar exatamente no distribuível.
    const cents =
      indice === premiados.length - 1
        ? distCents - alocado
        : Math.round((distCents * pctOf(settings, placement)) / somaPct);
    alocado += cents;
    byPlacement.push({ placement, amount: fromCents(cents) });
  });

  if (somaPct === 0 && distCents > 0) {
    // Sem percentuais configurados não há como repartir; devolve tudo ao 1º.
    byPlacement.push({ placement: 1, amount: fromCents(distCents) });
  }

  if (fifthCents > 0) byPlacement.push({ placement: 5, amount: fromCents(fifthCents) });

  return {
    gross: fromCents(grossCents),
    adminFeeTotal: fromCents(adminCents),
    otherCosts: fromCents(otherCents),
    fifthPrize: fromCents(fifthCents),
    reserveBase: fromCents(baseCents),
    reserve: fromCents(reserveCents),
    distributable: fromCents(distCents),
    byPlacement,
    totalPrizes: fromCents(distCents + fifthCents),
    shortfall,
  };
}

/**
 * Reserva da Etapa Final gerada por uma etapa: 10% do que sobra depois das
 * deduções. É esta função que alimenta o acumulado da temporada.
 */
export function computeReserve(
  costs: StageCosts,
  settings: PrizeSettings = DEFAULT_PRIZE_SETTINGS,
  availablePlacements: number[] = [1, 2, 3, 4, 5],
): number {
  return suggestStagePrizes(costs, settings, availablePlacements).reserve;
}

/**
 * Premiação da Etapa Final.
 *
 * A Final não separa reserva nova — ela DISTRIBUI a reserva acumulada no ano.
 * As deduções da própria final (taxa, custos, prêmio do 5º) continuam valendo,
 * e o que sobra é somado ao acumulado antes de repartir entre 1º e 4º.
 */
export function suggestFinalPrizes(
  accumulatedReserve: number,
  costs: StageCosts,
  settings: PrizeSettings = DEFAULT_PRIZE_SETTINGS,
  availablePlacements: number[] = [1, 2, 3, 4, 5],
): PrizeBreakdown {
  const semReserva = { ...settings, finalReservePct: 0 };
  const daEtapa = suggestStagePrizes(costs, semReserva, availablePlacements);

  // Repete a divisão com o bolo somado ao acumulado do ano.
  const comAcumulado = suggestStagePrizes(
    { ...costs, gross: round2(costs.gross + accumulatedReserve) },
    semReserva,
    availablePlacements,
  );

  return { ...comAcumulado, adminFeeTotal: daEtapa.adminFeeTotal };
}

export interface PrizeValidation {
  gross: number;
  /** Tudo que sai da arrecadação sem ir para jogador. */
  deductions: number;
  reserve: number;
  paidOut: number;
  /** gross − (deduções + reserva + prêmios). Zero = fechou certo. */
  difference: number;
  balanced: boolean;
  message: string;
}

/**
 * Confere se a etapa fecha: arrecadação = deduções + reserva + prêmios pagos.
 *
 * É um AVISO, não um bloqueio: a liga às vezes combina uma divisão diferente, e
 * o admin precisa poder salvar assim mesmo.
 */
export function validatePrizeDistribution(
  gross: number,
  deductions: number,
  reserve: number,
  prizeAmounts: number[],
): PrizeValidation {
  const grossCents = toCents(gross);
  const deductionCents = toCents(deductions);
  const reserveCents = toCents(reserve);
  const paidCents = prizeAmounts.reduce((sum, amount) => sum + toCents(amount || 0), 0);
  const differenceCents = grossCents - deductionCents - reserveCents - paidCents;

  const balanced = differenceCents === 0;
  let message: string;
  if (balanced) {
    message = "Custos, reserva e prêmios fecham exatamente com a arrecadação.";
  } else if (differenceCents > 0) {
    message = "Sobrando: a arrecadação é maior que custos + reserva + prêmios.";
  } else {
    message = "Estourou: custos + reserva + prêmios passam da arrecadação.";
  }

  return {
    gross: fromCents(grossCents),
    deductions: fromCents(deductionCents),
    reserve: fromCents(reserveCents),
    paidOut: fromCents(paidCents),
    difference: fromCents(differenceCents),
    balanced,
    message,
  };
}
