import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRIZE_SETTINGS,
  computeReserve,
  suggestFinalPrizes,
  suggestStagePrizes,
  validatePrizeDistribution,
} from "./prizes";

/** Etapa de referência para conferir a cascata na mão. */
const ETAPA = { gross: 10000, participants: 30, otherCosts: 500 };

describe("cascata de deduções", () => {
  const r = suggestStagePrizes(ETAPA);

  it("cobra a taxa de administração por jogador", () => {
    expect(r.adminFeeTotal).toBe(1800); // 30 × R$ 60
  });

  it("paga ao 5º a inscrição mais um add-on", () => {
    expect(r.fifthPrize).toBe(310); // 160 + 150
    expect(r.byPlacement.find((p) => p.placement === 5)?.amount).toBe(310);
  });

  it("a base da reserva é a arrecadação menos taxa, custos e o prêmio do 5º", () => {
    expect(r.reserveBase).toBe(7390); // 10000 − 1800 − 500 − 310
  });

  it("separa 10% da base para o Pote da Etapa Final", () => {
    expect(r.reserve).toBe(739);
    expect(r.distributable).toBe(6651);
  });

  it("divide o distribuível em 42 / 27 / 18 / 13", () => {
    const porColocacao = Object.fromEntries(r.byPlacement.map((p) => [p.placement, p.amount]));
    expect(porColocacao[1]).toBe(2793.42); // 42% de 6651
    expect(porColocacao[2]).toBe(1795.77); // 27%
    expect(porColocacao[3]).toBe(1197.18); // 18%
    expect(porColocacao[4]).toBe(864.63); // 13% — recebe o resto, fechando a conta
  });

  it("tudo somado reconstrói a arrecadação, sem centavo perdido", () => {
    const soma = r.adminFeeTotal + r.otherCosts + r.reserve + r.totalPrizes;
    expect(soma).toBeCloseTo(ETAPA.gross, 2);
  });

  it("os prêmios de 1º a 4º somam exatamente o distribuível", () => {
    const soma = r.byPlacement
      .filter((p) => p.placement <= 4)
      .reduce((s, p) => s + p.amount, 0);
    expect(soma).toBeCloseTo(r.distributable, 2);
  });
});

describe("arredondamento", () => {
  it("fecha exato mesmo com arrecadação de centavo quebrado", () => {
    const r = suggestStagePrizes({ gross: 7333.37, participants: 23, otherCosts: 137.11 });
    const soma = r.byPlacement.filter((p) => p.placement <= 4).reduce((s, p) => s + p.amount, 0);
    expect(soma).toBeCloseTo(r.distributable, 2);
    expect(r.adminFeeTotal + r.otherCosts + r.reserve + r.totalPrizes).toBeCloseTo(7333.37, 2);
  });
});

describe("etapas fora do padrão", () => {
  it("sem 5º colocado, não há prêmio de 5º e a base sobe", () => {
    const r = suggestStagePrizes(ETAPA, DEFAULT_PRIZE_SETTINGS, [1, 2, 3, 4]);
    expect(r.fifthPrize).toBe(0);
    expect(r.reserveBase).toBe(7700); // 10000 − 1800 − 500
    expect(r.byPlacement.some((p) => p.placement === 5)).toBe(false);
  });

  it("faltando o 4º, o percentual dele é repartido entre os presentes", () => {
    const r = suggestStagePrizes(ETAPA, DEFAULT_PRIZE_SETTINGS, [1, 2, 3, 5]);
    const soma = r.byPlacement.filter((p) => p.placement <= 4).reduce((s, p) => s + p.amount, 0);
    // Continua pagando o distribuível inteiro, só que entre três.
    expect(soma).toBeCloseTo(r.distributable, 2);
    expect(r.byPlacement.some((p) => p.placement === 4)).toBe(false);
  });

  it("avisa quando as deduções passam da arrecadação", () => {
    // Etapa minúscula: a taxa dos jogadores já supera o que entrou em caixa.
    const r = suggestStagePrizes({ gross: 300, participants: 30, otherCosts: 0 });
    expect(r.shortfall).toBe(true);
    expect(r.reserveBase).toBe(0);
    expect(r.distributable).toBe(0);
  });

  it("respeita taxa de administração própria da etapa", () => {
    const r = suggestStagePrizes({ ...ETAPA, adminFeePerPlayer: 0 });
    expect(r.adminFeeTotal).toBe(0);
    expect(r.reserveBase).toBe(9190); // 10000 − 0 − 500 − 310
  });

  it("respeita percentuais alterados pelo admin", () => {
    const r = suggestStagePrizes(ETAPA, {
      ...DEFAULT_PRIZE_SETTINGS,
      finalReservePct: 20,
      firstPct: 50,
      secondPct: 25,
      thirdPct: 15,
      fourthPct: 10,
    });
    expect(r.reserve).toBe(1478); // 20% de 7390
    expect(r.byPlacement.find((p) => p.placement === 1)?.amount).toBe(2956); // 50% de 5912
  });
});

describe("reserva registrada na origem (histórico das planilhas)", () => {
  // Etapa 1 de Jan/26: o pote de R$ 6.500 já vinha líquido de taxa e custos, e
  // a liga registrou R$ 650 de reserva. Esse número não pode mudar.
  const historica = {
    gross: 6500,
    participants: 29,
    adminFeePerPlayer: 0,
    otherCosts: 0,
    reserveOverride: 650,
  };

  it("mantém exatamente a reserva registrada, sem recalcular", () => {
    expect(suggestStagePrizes(historica).reserve).toBe(650);
    expect(computeReserve(historica)).toBe(650);
  });

  it("distribui o que sobra do pote depois da reserva", () => {
    const r = suggestStagePrizes(historica);
    // 6500 − 650 de reserva = 5850 para os jogadores (incluindo o 5º).
    expect(r.totalPrizes).toBe(5850);
    expect(r.fifthPrize).toBe(310);
    expect(r.distributable).toBe(5540); // 5850 − 310, dividido entre 1º e 4º
  });

  it("pote = reserva + prêmios, sem sobra", () => {
    const r = suggestStagePrizes(historica);
    expect(r.reserve + r.totalPrizes).toBeCloseTo(6500, 2);
  });

  it("uma reserva de zero é respeitada (não cai no cálculo automático)", () => {
    const r = suggestStagePrizes({ ...historica, reserveOverride: 0 });
    expect(r.reserve).toBe(0);
  });
});

describe("computeReserve", () => {
  it("devolve só a reserva da cascata", () => {
    expect(computeReserve(ETAPA)).toBe(739);
  });

  it("percentual zero não reserva nada", () => {
    expect(computeReserve(ETAPA, { ...DEFAULT_PRIZE_SETTINGS, finalReservePct: 0 })).toBe(0);
  });
});

describe("Etapa Final", () => {
  it("soma o acumulado do ano ao que sobra da própria final, sem reservar de novo", () => {
    const r = suggestFinalPrizes(5210, { gross: 4000, participants: 20, otherCosts: 0 });
    expect(r.reserve).toBe(0);
    // (4000 − 1200 de taxa − 310 do 5º) + 5210 acumulado
    expect(r.distributable).toBe(7700);
    const soma = r.byPlacement.filter((p) => p.placement <= 4).reduce((s, p) => s + p.amount, 0);
    expect(soma).toBeCloseTo(r.distributable, 2);
  });

  it("sem buy-ins na final, distribui só o acumulado", () => {
    const r = suggestFinalPrizes(5210, { gross: 0, participants: 0, otherCosts: 0 }, DEFAULT_PRIZE_SETTINGS, [1, 2, 3, 4]);
    expect(r.distributable).toBe(5210);
  });
});

describe("validação da premiação (aviso não-bloqueante)", () => {
  it("confirma quando custos, reserva e prêmios fecham com a arrecadação", () => {
    const check = validatePrizeDistribution(10000, 2300, 739, [2793.42, 1795.77, 1197.18, 864.63, 310]);
    expect(check.balanced).toBe(true);
    expect(check.difference).toBe(0);
  });

  it("acusa sobra quando faltou distribuir", () => {
    const check = validatePrizeDistribution(10000, 2300, 739, [2793.42, 1795.77]);
    expect(check.balanced).toBe(false);
    expect(check.difference).toBeGreaterThan(0);
    expect(check.message).toContain("Sobrando");
  });

  it("acusa estouro quando pagaram além do caixa", () => {
    const check = validatePrizeDistribution(10000, 2300, 739, [5000, 3000, 1500, 900, 310]);
    expect(check.balanced).toBe(false);
    expect(check.difference).toBeLessThan(0);
    expect(check.message).toContain("Estourou");
  });

  it("aceita divisão combinada fora do padrão, desde que a soma feche", () => {
    const check = validatePrizeDistribution(10000, 2300, 739, [3000, 1700, 1100, 851, 310]);
    expect(check.balanced).toBe(true);
  });
});
