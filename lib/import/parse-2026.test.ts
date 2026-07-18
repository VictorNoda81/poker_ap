/**
 * Testes de integração da importação: leem a planilha real em `data/2026.xlsx`
 * e conferem o resultado contra os números que aparecem nela.
 *
 * É esta suíte que garante que o seed não distorce os dados históricos.
 */

import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildRanking, type RankingEntry, type RankingPlayer } from "../domain/ranking";
import { excelSerialToISO, normalizePlayerName, parse2026Workbook } from "./parse-2026";

const WORKBOOK = path.resolve(__dirname, "../../data/2026.xlsx");
const parsed = parse2026Workbook(WORKBOOK);

describe("conversão de data do Excel", () => {
  it("converte os números de série das etapas de 2026", () => {
    expect(excelSerialToISO(46051)).toBe("2026-01-29");
    expect(excelSerialToISO(46233)).toBe("2026-07-30");
  });
});

describe("normalização de nomes", () => {
  it("converte CAIXA ALTA em nome próprio preservando acentos", () => {
    expect(normalizePlayerName("RODOLFO NEGRÃO")).toBe("Rodolfo Negrão");
    expect(normalizePlayerName("IGOR THEODORAKOPOULOS")).toBe("Igor Theodorakopoulos");
  });

  it("remove espaços sobrando das pontas e do meio", () => {
    expect(normalizePlayerName("PEDRO COSTA ")).toBe("Pedro Costa");
    expect(normalizePlayerName("  FRED  ")).toBe("Fred");
  });

  it("mantém conectivos em minúsculas", () => {
    expect(normalizePlayerName("SILVIO DE PAULA")).toBe("Silvio de Paula");
  });

  it("capitaliza apelido entre parênteses", () => {
    expect(normalizePlayerName("PEDRO LINS (PEU)")).toBe("Pedro Lins (Peu)");
  });
});

describe("tabela de pontuação lida da planilha", () => {
  it("bate com a tabela oficial da liga", () => {
    expect(parsed.pointsTable).toEqual({
      1: 55, 2: 48, 3: 43, 4: 38, 5: 33,
      6: 28, 7: 23, 8: 20, 9: 17, 10: 15,
      11: 13, 12: 11, 13: 9, 14: 7, 15: 6,
    });
    expect(parsed.pointsBelowCutoff).toBe(5);
  });
});

describe("etapas da temporada 2026", () => {
  it("encontra as 7 etapas com suas datas", () => {
    expect(parsed.stages.map((s) => [s.number, s.date])).toEqual([
      [1, "2026-01-29"],
      [2, "2026-02-26"],
      [3, "2026-03-26"],
      [4, "2026-04-23"],
      [5, "2026-05-28"],
      [6, "2026-06-18"],
      [7, "2026-07-30"],
    ]);
  });

  it("deduz a arrecadação de cada etapa a partir da linha dos 10%", () => {
    const realizadas = parsed.stages.filter((s) => s.grossAmount !== null);
    expect(realizadas.map((s) => s.reserveAmount)).toEqual([650, 1000, 900, 810, 1150, 700]);
    expect(realizadas.map((s) => s.grossAmount)).toEqual([6500, 10000, 9000, 8100, 11500, 7000]);
  });

  it("a etapa 7 ainda não ocorreu — sem arrecadação", () => {
    const etapa7 = parsed.stages.find((s) => s.number === 7);
    expect(etapa7?.grossAmount).toBeNull();
  });

  it("a reserva acumulada da temporada fecha em R$ 5.210", () => {
    const total = parsed.stages.reduce((sum, s) => sum + (s.reserveAmount ?? 0), 0);
    expect(total).toBe(5210);
  });
});

describe("jogadores", () => {
  it("importa os 56 jogadores da planilha", () => {
    expect(parsed.players).toHaveLength(56);
  });

  it("não repete nome (a chave natural do seed)", () => {
    const unicos = new Set(parsed.players.map((n) => n.toLowerCase()));
    expect(unicos.size).toBe(parsed.players.length);
  });

  it("distingue os homônimos parciais da planilha", () => {
    expect(parsed.players).toContain("Fábio");
    expect(parsed.players).toContain("Fábio Tieza");
    expect(parsed.players).toContain("Fábio Segura");
    expect(parsed.players).toContain("Pedro");
    expect(parsed.players).toContain("Pedro Costa");
  });
});

describe("resultados", () => {
  it("não cria participação para quem tem 0 pontos na etapa", () => {
    // Regina Sevilla só jogou a etapa 1 (48 pontos); as demais estão zeradas.
    const regina = parsed.results.filter((r) => r.playerName === "Regina Sevilla");
    expect(regina).toHaveLength(1);
    expect(regina[0].stageNumber).toBe(1);
    expect(regina[0].points).toBe(48);
    expect(regina[0].placement).toBe(2);
  });

  it("deriva a colocação a partir dos pontos", () => {
    // Renato Cândido fez 55 pontos na etapa 1 — foi o campeão.
    const renato = parsed.results.find(
      (r) => r.playerName === "Renato Cândido" && r.stageNumber === 1,
    );
    expect(renato?.points).toBe(55);
    expect(renato?.placement).toBe(1);
  });

  it("deixa a colocação nula na faixa '16º ou pior'", () => {
    const cincoPontos = parsed.results.filter((r) => r.points === 5);
    expect(cincoPontos.length).toBeGreaterThan(0);
    expect(cincoPontos.every((r) => r.placement === null)).toBe(true);
  });

  it("marca para revisão as colocações duplicadas da planilha", () => {
    // Na etapa 1 há dois jogadores com 28 pontos (6º) e dois com 20 (8º).
    const revisar = parsed.results.filter((r) => r.stageNumber === 1 && r.needsReview);
    const nomes = revisar.map((r) => r.playerName).sort();
    expect(nomes).toEqual(["Fabricio", "Lucio", "Miguel", "Rogério"]);
    expect(revisar.every((r) => r.reviewNote?.includes("duplicada"))).toBe(true);
  });

  it("não marca revisão onde a planilha está consistente", () => {
    const semRevisao = parsed.results.filter((r) => r.stageNumber === 6 && r.needsReview);
    expect(semRevisao).toHaveLength(0);
  });
});

describe("ranking reconstruído bate com a planilha", () => {
  const players: RankingPlayer[] = parsed.players.map((name) => ({
    id: name,
    fullName: name,
    type: "indefinido",
    memberNumber: null,
    invitedByName: null,
  }));

  const entries: RankingEntry[] = parsed.results.map((r) => ({
    stageId: `etapa-${r.stageNumber}`,
    playerId: r.playerName,
    placement: r.placement,
    points: r.points,
    amountPaid: null,
    prizeAmount: 0,
  }));

  const ranking = buildRanking(players, entries);

  it("reproduz o total de pontos de cada jogador da planilha", () => {
    for (const row of ranking) {
      expect(row.totalPoints).toBe(parsed.spreadsheetTotals.get(row.player.fullName));
    }
  });

  it("mantém a liderança da Ligia com 174 pontos", () => {
    expect(ranking[0].player.fullName).toBe("Ligia");
    expect(ranking[0].totalPoints).toBe(174);
  });

  it("reproduz o topo do ranking da planilha", () => {
    expect(ranking.slice(0, 3).map((r) => [r.player.fullName, r.totalPoints])).toEqual([
      ["Ligia", 174],
      ["Paulo Amaral", 164],
      ["Evandro Pereira", 121],
    ]);
  });

  it("o somatório geral de pontos confere", () => {
    const totalRanking = ranking.reduce((sum, r) => sum + r.totalPoints, 0);
    const totalPlanilha = [...parsed.spreadsheetTotals.values()].reduce((a, b) => a + b, 0);
    expect(totalRanking).toBe(totalPlanilha);
  });
});
