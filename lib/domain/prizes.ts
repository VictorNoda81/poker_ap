/**
 * Premiação da etapa.
 *
 * Fluxo da regra da liga:
 *
 *   arrecadação (tudo que os jogadores gastaram)
 *     └─ reserva 10%  ──────────────► acumula para a Etapa Final
 *     └─ restante (distribuível)
 *          ├─ 1º lugar: 50% do distribuível
 *          ├─ 2º lugar: 30% do distribuível
 *          ├─ 4º lugar: R$ 150 fixo
 *          └─ 3º lugar: A DIFERENÇA (o que sobrar após 1º, 2º e 4º)
 *
 * O 3º lugar é calculado por diferença justamente para que a soma feche exata,
 * sem sobra de centavo. Tudo isso é apenas uma SUGESTÃO pré-preenchida: o admin
 * pode sobrescrever qualquer valor, premiar o 5º lugar, ou fazer uma divisão
 * combinada entre os jogadores.
 */

import { fromCents, round2, toCents } from "./money";

export interface PrizeSettings {
  /** Percentual da arrecadação reservado para a Etapa Final (10 = 10%). */
  finalReservePct: number;
  /** Percentual do distribuível para o 1º lugar (50 = 50%). */
  firstPct: number;
  /** Percentual do distribuível para o 2º lugar (30 = 30%). */
  secondPct: number;
  /** Valor fixo em reais para o 4º lugar. */
  fourthFixed: number;
}

export const DEFAULT_PRIZE_SETTINGS: PrizeSettings = {
  finalReservePct: 10,
  firstPct: 50,
  secondPct: 30,
  fourthFixed: 150,
};

export interface PrizeBreakdown {
  /** Arrecadação total da etapa. */
  gross: number;
  /** Valor separado para a Etapa Final. */
  reserve: number;
  /** Arrecadação menos a reserva — a base da premiação. */
  distributable: number;
  /** Sugestão de prêmio por colocação, já arredondada. */
  byPlacement: { placement: number; amount: number }[];
  /**
   * true quando o distribuível não cobre 1º + 2º + 4º e o 3º ficaria negativo.
   * Nesse caso o 3º é zerado e o admin precisa ajustar na mão.
   */
  thirdWouldBeNegative: boolean;
}

/** Reserva da Etapa Final: percentual sobre a arrecadação bruta. */
export function computeReserve(gross: number, finalReservePct: number): number {
  return fromCents(Math.round((toCents(gross) * finalReservePct) / 100));
}

/**
 * Monta a sugestão de premiação de uma etapa regular.
 *
 * `availablePlacements` permite lidar com etapas pequenas: se ninguém terminou
 * em 4º, o valor fixo do 4º não é separado e sobra para o 3º.
 */
export function suggestStagePrizes(
  gross: number,
  settings: PrizeSettings = DEFAULT_PRIZE_SETTINGS,
  availablePlacements: number[] = [1, 2, 3, 4],
): PrizeBreakdown {
  const available = new Set(availablePlacements);

  const grossCents = toCents(gross);
  const reserveCents = Math.round((grossCents * settings.finalReservePct) / 100);
  const distributableCents = grossCents - reserveCents;

  const firstCents = available.has(1)
    ? Math.round((distributableCents * settings.firstPct) / 100)
    : 0;
  const secondCents = available.has(2)
    ? Math.round((distributableCents * settings.secondPct) / 100)
    : 0;
  const fourthCents = available.has(4) ? toCents(settings.fourthFixed) : 0;

  // O 3º recebe a diferença, garantindo que a soma feche exatamente com o
  // distribuível — sem centavo perdido no arredondamento.
  let thirdCents = available.has(3)
    ? distributableCents - firstCents - secondCents - fourthCents
    : 0;

  const thirdWouldBeNegative = thirdCents < 0;
  if (thirdWouldBeNegative) thirdCents = 0;

  const byPlacement = [
    { placement: 1, amount: fromCents(firstCents) },
    { placement: 2, amount: fromCents(secondCents) },
    { placement: 3, amount: fromCents(thirdCents) },
    { placement: 4, amount: fromCents(fourthCents) },
  ].filter((p) => available.has(p.placement));

  return {
    gross: fromCents(grossCents),
    reserve: fromCents(reserveCents),
    distributable: fromCents(distributableCents),
    byPlacement,
    thirdWouldBeNegative,
  };
}

/**
 * Premiação da Etapa Final.
 *
 * A Final não separa reserva nova — ela DISTRIBUI a reserva acumulada durante
 * a temporada. Se a Final também teve buy-ins, esse valor entra no bolo.
 * A divisão percentual segue a mesma regra das etapas regulares.
 */
export function suggestFinalPrizes(
  accumulatedReserve: number,
  finalStageGross: number,
  settings: PrizeSettings = DEFAULT_PRIZE_SETTINGS,
  availablePlacements: number[] = [1, 2, 3, 4],
): PrizeBreakdown {
  const pool = round2(accumulatedReserve + finalStageGross);
  // finalReservePct = 0: a Final não guarda nada para depois, distribui tudo.
  return suggestStagePrizes(pool, { ...settings, finalReservePct: 0 }, availablePlacements);
}

export interface PrizeValidation {
  /** Arrecadação da etapa. */
  gross: number;
  /** Reserva separada para a Final. */
  reserve: number;
  /** Soma de tudo que foi efetivamente pago aos jogadores. */
  paidOut: number;
  /** gross − (reserve + paidOut). Zero = fechou certo. */
  difference: number;
  /** true quando a diferença é zero. */
  balanced: boolean;
  /** Mensagem pronta para exibir ao admin. */
  message: string;
}

/**
 * Confere se prêmios pagos + reserva batem com a arrecadação.
 *
 * É um AVISO, não um bloqueio: às vezes a liga combina de reter ou distribuir
 * um valor diferente, e o admin precisa poder salvar assim mesmo.
 */
export function validatePrizeDistribution(
  gross: number,
  reserve: number,
  prizeAmounts: number[],
): PrizeValidation {
  const grossCents = toCents(gross);
  const reserveCents = toCents(reserve);
  const paidCents = prizeAmounts.reduce((sum, amount) => sum + toCents(amount || 0), 0);
  const differenceCents = grossCents - reserveCents - paidCents;

  const balanced = differenceCents === 0;
  let message: string;
  if (balanced) {
    message = "Prêmios pagos + reserva fecham exatamente com a arrecadação.";
  } else if (differenceCents > 0) {
    message = `Sobrando: a arrecadação é maior que prêmios + reserva. Faltam distribuir.`;
  } else {
    message = `Estourou: prêmios + reserva passam da arrecadação da etapa.`;
  }

  return {
    gross: fromCents(grossCents),
    reserve: fromCents(reserveCents),
    paidOut: fromCents(paidCents),
    difference: fromCents(differenceCents),
    balanced,
    message,
  };
}
