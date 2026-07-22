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
 *          ├─ 10% ................. acumula no Pote Acumulado (ver abaixo)
 *          └─ distribuível ........ 1º 42% · 2º 27% · 3º 18% · 4º 13%
 *
 * O Pote Acumulado, no fim da temporada, se divide em duas partes:
 *
 *   Pote Acumulado (soma dos 10% de todas as etapas)
 *     ├─ 50% ... prêmio dos LÍDERES DO RANKING (1º 50% · 2º 30% · 3º 20%)
 *     └─ 50% ... pote disputado na mesa da Etapa Final
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
  /**
   * Quanto do Pote Acumulado vai para os líderes do ranking (50 = 50%). O resto
   * é o pote disputado na mesa da Etapa Final.
   */
  rankingSharePct: number;
  /** Divisão da parte dos líderes entre 1º, 2º e 3º do ranking. Somam 100. */
  rankingFirstPct: number;
  rankingSecondPct: number;
  rankingThirdPct: number;
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
  rankingSharePct: 50,
  rankingFirstPct: 50,
  rankingSecondPct: 30,
  rankingThirdPct: 20,
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
  /**
   * Reserva já conhecida da etapa. Quando informada, vale sobre o cálculo —
   * é o caso do histórico, em que a liga registrou o valor do pote e ele não
   * deve mudar. O distribuível passa a ser o que sobra depois dela.
   */
  reserveOverride?: number | null;
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

  // Reserva conhecida da origem manda sobre a fórmula (histórico importado).
  const reserveCents =
    costs.reserveOverride === null || costs.reserveOverride === undefined
      ? Math.round((baseCents * settings.finalReservePct) / 100)
      : toCents(costs.reserveOverride);
  const distCents = Math.max(0, baseCents - reserveCents);

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

export interface FinalPotSplit {
  /** Soma dos 10% de todas as etapas. */
  accumulated: number;
  /** Parte que vai para os líderes do ranking da temporada. */
  rankingShare: number;
  /** Parte que entra na mesa da Etapa Final. */
  stagePot: number;
  /** Quanto cada colocação do RANKING leva, já arredondado. */
  byRankingPlace: { place: number; amount: number }[];
}

/**
 * Divide o Pote Acumulado entre os líderes do ranking e a mesa da Etapa Final.
 *
 * `availablePlaces` cobre a temporada com menos de três colocados: o percentual
 * de quem não existe é redistribuído entre os que existem, para o pote sair
 * inteiro. O último da lista recebe o resto em centavos, então a soma fecha.
 */
export function splitFinalPot(
  accumulated: number,
  settings: PrizeSettings = DEFAULT_PRIZE_SETTINGS,
  availablePlaces: number[] = [1, 2, 3],
): FinalPotSplit {
  const totalCents = Math.max(0, toCents(accumulated));
  const sharePct = Math.min(100, Math.max(0, settings.rankingSharePct));
  const rankingCents = Math.round((totalCents * sharePct) / 100);
  const stageCents = totalCents - rankingCents;

  const pctDe = (place: number): number =>
    place === 1
      ? settings.rankingFirstPct
      : place === 2
        ? settings.rankingSecondPct
        : place === 3
          ? settings.rankingThirdPct
          : 0;

  const premiados = [1, 2, 3].filter((p) => availablePlaces.includes(p) && pctDe(p) > 0);
  const somaPct = premiados.reduce((soma, p) => soma + pctDe(p), 0);

  const byRankingPlace: { place: number; amount: number }[] = [];
  let alocado = 0;
  premiados.forEach((place, indice) => {
    const cents =
      indice === premiados.length - 1
        ? rankingCents - alocado
        : Math.round((rankingCents * pctDe(place)) / somaPct);
    alocado += cents;
    byRankingPlace.push({ place, amount: fromCents(cents) });
  });

  return {
    accumulated: fromCents(totalCents),
    // Sem ninguém a premiar, a parte dos líderes não some: volta para a mesa.
    rankingShare: fromCents(premiados.length > 0 ? rankingCents : 0),
    stagePot: fromCents(premiados.length > 0 ? stageCents : totalCents),
    byRankingPlace,
  };
}

/**
 * Premiação da Etapa Final.
 *
 * A Final não separa reserva nova — ela DISTRIBUI o que o ano acumulou. As
 * deduções da própria final (taxa, custos, prêmio do 5º) continuam valendo, e o
 * que sobra é somado ao pote antes de repartir entre 1º e 4º.
 *
 * Atenção: o valor esperado aqui é o `stagePot` de `splitFinalPot`, NÃO o Pote
 * Acumulado inteiro — a parte dos líderes do ranking não vai para a mesa.
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
