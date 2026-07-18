import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRIZE_SETTINGS,
  computeReserve,
  suggestFinalPrizes,
  suggestStagePrizes,
  validatePrizeDistribution,
} from "./prizes";

/** Arrecadação real de cada etapa de 2026, deduzida da linha dos 10% da planilha. */
const ARRECADACAO_2026 = [6500, 10000, 9000, 8100, 11500, 7000];

describe("reserva da Etapa Final", () => {
  it("separa 10% da arrecadação de cada etapa de 2026", () => {
    const reservas = ARRECADACAO_2026.map((gross) => computeReserve(gross, 10));
    expect(reservas).toEqual([650, 1000, 900, 810, 1150, 700]);
  });

  it("a soma bate com o acumulado da planilha (R$ 5.210)", () => {
    const total = ARRECADACAO_2026.reduce((sum, g) => sum + computeReserve(g, 10), 0);
    expect(total).toBe(5210);
  });

  it("aceita percentual customizado", () => {
    expect(computeReserve(1000, 15)).toBe(150);
    expect(computeReserve(1000, 0)).toBe(0);
  });

  it("arredonda para o centavo, sem erro de ponto flutuante", () => {
    expect(computeReserve(333.33, 10)).toBe(33.33);
  });
});

describe("distribuição padrão da etapa", () => {
  it("calcula a etapa 1 de 2026 (R$ 6.500) conforme a regra da liga", () => {
    const result = suggestStagePrizes(6500);

    expect(result.reserve).toBe(650); // 10% para a Final
    expect(result.distributable).toBe(5850); // 6500 − 650
    expect(result.byPlacement).toEqual([
      { placement: 1, amount: 2925 }, // 50% de 5850
      { placement: 2, amount: 1755 }, // 30% de 5850
      { placement: 3, amount: 1020 }, // a diferença
      { placement: 4, amount: 150 },  // valor fixo
    ]);
  });

  it("calcula a etapa 4 de 2026 (R$ 8.100), que não é múltiplo redondo", () => {
    const result = suggestStagePrizes(8100);
    expect(result.reserve).toBe(810);
    expect(result.distributable).toBe(7290);
    expect(result.byPlacement.map((p) => p.amount)).toEqual([3645, 2187, 1308, 150]);
  });

  it("os prêmios sempre somam exatamente o distribuível, em todas as etapas", () => {
    for (const gross of ARRECADACAO_2026) {
      const result = suggestStagePrizes(gross);
      const soma = result.byPlacement.reduce((s, p) => s + p.amount, 0);
      expect(soma).toBeCloseTo(result.distributable, 2);
      // E o distribuível + reserva reconstroem a arrecadação.
      expect(result.distributable + result.reserve).toBeCloseTo(gross, 2);
    }
  });

  it("fecha exato mesmo com arrecadação de centavo quebrado", () => {
    const result = suggestStagePrizes(7333.37);
    const soma = result.byPlacement.reduce((s, p) => s + p.amount, 0);
    expect(soma).toBeCloseTo(result.distributable, 2);
  });

  it("dá tudo que sobra ao 3º quando não houve 4º colocado", () => {
    const result = suggestStagePrizes(6500, DEFAULT_PRIZE_SETTINGS, [1, 2, 3]);
    expect(result.byPlacement).toEqual([
      { placement: 1, amount: 2925 },
      { placement: 2, amount: 1755 },
      { placement: 3, amount: 1170 }, // 1020 + os 150 do 4º
    ]);
  });

  it("zera o 3º e avisa quando o bolo não cobre 1º + 2º + 4º", () => {
    // Arrecadação minúscula: 80% já vão para 1º e 2º, e ainda faltam os R$ 150.
    const result = suggestStagePrizes(300);
    expect(result.thirdWouldBeNegative).toBe(true);
    expect(result.byPlacement.find((p) => p.placement === 3)?.amount).toBe(0);
  });

  it("respeita percentuais alterados pelo admin", () => {
    const result = suggestStagePrizes(10000, {
      finalReservePct: 20,
      firstPct: 60,
      secondPct: 25,
      fourthFixed: 200,
    });
    expect(result.reserve).toBe(2000);
    expect(result.distributable).toBe(8000);
    expect(result.byPlacement.map((p) => p.amount)).toEqual([4800, 2000, 1000, 200]);
  });
});

describe("premiação da Etapa Final", () => {
  it("distribui a reserva acumulada da temporada sem separar reserva nova", () => {
    const result = suggestFinalPrizes(5210, 0);
    expect(result.reserve).toBe(0);
    expect(result.distributable).toBe(5210);
    const soma = result.byPlacement.reduce((s, p) => s + p.amount, 0);
    expect(soma).toBeCloseTo(5210, 2);
  });

  it("soma os buy-ins da própria Final ao bolo acumulado", () => {
    const result = suggestFinalPrizes(5210, 3000);
    expect(result.distributable).toBe(8210);
  });
});

describe("validação da premiação (aviso não-bloqueante)", () => {
  it("confirma quando prêmios + reserva fecham com a arrecadação", () => {
    const check = validatePrizeDistribution(6500, 650, [2925, 1755, 1020, 150]);
    expect(check.balanced).toBe(true);
    expect(check.difference).toBe(0);
  });

  it("acusa sobra quando faltou distribuir", () => {
    const check = validatePrizeDistribution(6500, 650, [2925, 1755]);
    expect(check.balanced).toBe(false);
    expect(check.difference).toBe(1170);
    expect(check.message).toContain("Sobrando");
  });

  it("acusa estouro quando pagaram além da arrecadação", () => {
    const check = validatePrizeDistribution(6500, 650, [3000, 1755, 1020, 150, 500]);
    expect(check.balanced).toBe(false);
    expect(check.difference).toBeLessThan(0);
    expect(check.message).toContain("Estourou");
  });

  it("aceita divisão combinada fora do padrão, desde que a soma feche", () => {
    // A liga combinou premiar também o 5º lugar, redividindo o bolo.
    const check = validatePrizeDistribution(6500, 650, [2500, 1500, 1000, 500, 350]);
    expect(check.balanced).toBe(true);
  });

  it("não gera falso alarme por arredondamento de ponto flutuante", () => {
    const check = validatePrizeDistribution(8100, 810, [3645, 2187, 1308, 150]);
    expect(check.balanced).toBe(true);
  });
});
