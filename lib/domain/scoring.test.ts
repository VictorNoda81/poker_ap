import { describe, expect, it } from "vitest";
import {
  DEFAULT_POINTS_BELOW_CUTOFF,
  DEFAULT_POINTS_TABLE,
  placementFromPoints,
  pointsForPlacement,
  suggestAmountPaid,
} from "./scoring";

describe("tabela de pontuação", () => {
  it("reproduz a tabela oficial da liga (aba 'Pontos por Partida')", () => {
    expect(DEFAULT_POINTS_TABLE).toEqual({
      1: 55, 2: 48, 3: 43, 4: 38, 5: 33,
      6: 28, 7: 23, 8: 20, 9: 17, 10: 15,
      11: 13, 12: 11, 13: 9, 14: 7, 15: 6,
    });
    expect(DEFAULT_POINTS_BELOW_CUTOFF).toBe(5);
  });

  it("cada colocação de 1º a 15º vale um número distinto de pontos", () => {
    const values = Object.values(DEFAULT_POINTS_TABLE);
    expect(new Set(values).size).toBe(values.length);
  });

  it("nenhuma colocação de 1º a 15º vale o mesmo que a faixa '16º ou pior'", () => {
    // É isso que garante que a inversão pontos -> colocação seja exata.
    expect(Object.values(DEFAULT_POINTS_TABLE)).not.toContain(DEFAULT_POINTS_BELOW_CUTOFF);
  });
});

describe("pointsForPlacement", () => {
  it("credita os pontos da tabela para 1º a 15º", () => {
    expect(pointsForPlacement(1)).toBe(55);
    expect(pointsForPlacement(4)).toBe(38);
    expect(pointsForPlacement(15)).toBe(6);
  });

  it("credita a faixa fixa para 16º ou pior", () => {
    expect(pointsForPlacement(16)).toBe(5);
    expect(pointsForPlacement(17)).toBe(5);
    expect(pointsForPlacement(40)).toBe(5);
  });

  it("trata colocação nula como '16º ou pior'", () => {
    expect(pointsForPlacement(null)).toBe(5);
  });

  it("respeita tabela e faixa customizadas pelo admin", () => {
    expect(pointsForPlacement(1, { 1: 100 }, 2)).toBe(100);
    expect(pointsForPlacement(9, { 1: 100 }, 2)).toBe(2);
  });
});

describe("placementFromPoints (inversão usada na importação)", () => {
  it("faz o caminho de volta para todas as colocações da tabela", () => {
    for (const [placement, points] of Object.entries(DEFAULT_POINTS_TABLE)) {
      expect(placementFromPoints(points)).toEqual({
        placement: Number(placement),
        unknown: false,
      });
    }
  });

  it("mapeia a faixa fixa para colocação desconhecida, sem marcar erro", () => {
    expect(placementFromPoints(5)).toEqual({ placement: null, unknown: false });
  });

  it("sinaliza pontuação que não existe na tabela", () => {
    expect(placementFromPoints(42)).toEqual({ placement: null, unknown: true });
  });
});

describe("suggestAmountPaid", () => {
  it("soma buy-in + re-buys + add-on com os valores padrão da liga", () => {
    // Buy-in 150, dois re-buys de 100, add-on 150 = 500
    expect(suggestAmountPaid(150, 100, 2, 150, true)).toBe(500);
  });

  it("só buy-in quando não houve re-buy nem add-on", () => {
    expect(suggestAmountPaid(150, 100, 0, 150, false)).toBe(150);
  });

  it("ignora quantidade negativa de re-buys", () => {
    expect(suggestAmountPaid(150, 100, -3, 150, false)).toBe(150);
  });
});
