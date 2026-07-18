/**
 * Pontuação por colocação.
 *
 * Regra da liga: colocações de 1º a 15º pontuam conforme a tabela; 16º ou pior
 * ganha um valor fixo (5 por padrão). Tudo editável no admin — as constantes
 * abaixo são só o padrão de fábrica, extraído da planilha "Pontos por Partida".
 */

/** Colocação -> pontos. Padrão da liga (aba "Plan2" da planilha 2026). */
export const DEFAULT_POINTS_TABLE: Readonly<Record<number, number>> = {
  1: 55,
  2: 48,
  3: 43,
  4: 38,
  5: 33,
  6: 28,
  7: 23,
  8: 20,
  9: 17,
  10: 15,
  11: 13,
  12: 11,
  13: 9,
  14: 7,
  15: 6,
};

/** Pontos de quem termina em 16º ou pior. */
export const DEFAULT_POINTS_BELOW_CUTOFF = 5;

/** Primeira colocação que cai na faixa "16º ou pior". */
export const CUTOFF_PLACEMENT = 16;

export type PointsTable = Record<number, number>;

/**
 * Pontos que uma colocação vale.
 *
 * `placement === null` significa "participou, mas a colocação exata não foi
 * registrada" — o que na prática só acontece na faixa 16º ou pior, onde a
 * posição exata não muda a pontuação.
 */
export function pointsForPlacement(
  placement: number | null,
  table: PointsTable = DEFAULT_POINTS_TABLE,
  belowCutoffPoints: number = DEFAULT_POINTS_BELOW_CUTOFF,
): number {
  if (placement === null || placement === undefined) return belowCutoffPoints;
  const points = table[placement];
  return points === undefined ? belowCutoffPoints : points;
}

export interface PlacementFromPoints {
  /** Colocação identificada, ou null quando o valor é o da faixa "16º ou pior". */
  placement: number | null;
  /** true quando o valor de pontos não corresponde a nenhuma colocação conhecida. */
  unknown: boolean;
}

/**
 * Inverso de `pointsForPlacement`: descobre a colocação a partir dos pontos.
 *
 * Usado só pela importação da planilha de 2026, que registrou apenas a
 * pontuação de cada jogador. Como cada colocação de 1º a 15º vale um número
 * distinto, o mapeamento é único nessa faixa.
 */
export function placementFromPoints(
  points: number,
  table: PointsTable = DEFAULT_POINTS_TABLE,
  belowCutoffPoints: number = DEFAULT_POINTS_BELOW_CUTOFF,
): PlacementFromPoints {
  for (const [placement, value] of Object.entries(table)) {
    if (value === points) return { placement: Number(placement), unknown: false };
  }
  if (points === belowCutoffPoints) return { placement: null, unknown: false };
  return { placement: null, unknown: true };
}

/**
 * Total gasto por um jogador na etapa, a partir dos componentes.
 * Usado só como SUGESTÃO no formulário — o campo que vale é o valor digitado.
 */
export function suggestAmountPaid(
  buyin: number,
  rebuyPrice: number,
  rebuys: number,
  addonPrice: number,
  hadAddon: boolean,
): number {
  return buyin + rebuyPrice * Math.max(0, rebuys) + (hadAddon ? addonPrice : 0);
}
