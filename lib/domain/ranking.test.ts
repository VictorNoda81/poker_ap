import { describe, expect, it } from "vitest";
import {
  accumulatedFinalReserve,
  buildRanking,
  derivePlacements,
  temExtrasCompletos,
  suggestFinalInvitees,
  type RankingEntry,
  type RankingPlayer,
} from "./ranking";

function player(id: string, fullName: string): RankingPlayer {
  return { id, fullName, type: "indefinido", memberNumber: null, invitedByName: null };
}

function entry(
  stageId: string,
  playerId: string,
  placement: number,
  points: number,
  amountPaid: number | null = null,
  prizeAmount = 0,
): RankingEntry {
  return { stageId, playerId, placement, points, amountPaid, prizeAmount };
}

describe("buildRanking", () => {
  it("soma os pontos das etapas e ordena do maior para o menor", () => {
    const players = [player("a", "Ana"), player("b", "Bruno")];
    const entries = [
      entry("e1", "a", 3, 43),
      entry("e2", "a", 10, 15),
      entry("e1", "b", 1, 55),
    ];

    const ranking = buildRanking(players, entries);
    expect(ranking.map((r) => [r.position, r.player.fullName, r.totalPoints])).toEqual([
      [1, "Ana", 58], // 43 + 15
      [2, "Bruno", 55],
    ]);
  });

  it("calcula pago, arrecadado e saldo", () => {
    const players = [player("a", "Ana")];
    const entries = [
      entry("e1", "a", 1, 55, 350, 2925),
      entry("e2", "a", 12, 11, 250, 0),
    ];

    const [ana] = buildRanking(players, entries);
    expect(ana.totalPaid).toBe(600);
    expect(ana.totalReceived).toBe(2925);
    expect(ana.balance).toBe(2325);
  });

  it("saldo fica negativo quando o jogador gastou mais do que ganhou", () => {
    const players = [player("a", "Ana")];
    const entries = [entry("e1", "a", 20, 5, 450, 0)];
    expect(buildRanking(players, entries)[0].balance).toBe(-450);
  });

  it("médias consideram apenas as etapas em que o jogador participou", () => {
    const players = [player("a", "Ana")];
    // Jogou 2 de 3 etapas possíveis: 1º (55 pts) e 5º (33 pts).
    const entries = [entry("e1", "a", 1, 55), entry("e2", "a", 5, 33)];

    const [ana] = buildRanking(players, entries);
    expect(ana.stagesPlayed).toBe(2);
    expect(ana.averagePlacement).toBe(3); // (1 + 5) / 2
    expect(ana.averagePoints).toBe(44); // (55 + 33) / 2
  });

  it("etapa abaixo do corte conta na média com a colocação deduzida", () => {
    // O caso que motivou a mudança: quem foi bem em UMA etapa e mal nas outras
    // aparecia com a média da única etapa colocada — 2,0 aqui, em vez de 9,0.
    const players = [player("a", "Ana")];
    // e2: mais 15 jogadores pontuaram acima dela, logo Ana terminou em 16º.
    const outros = Array.from({ length: 15 }, (_, i) => player(`x${i}`, `Rival ${i}`));
    const entries = derivePlacements([
      { stageId: "e1", playerId: "a", points: 48, amountPaid: null, prizeAmount: 0 },
      { stageId: "e1", playerId: "x0", points: 55, amountPaid: null, prizeAmount: 0 },
      { stageId: "e2", playerId: "a", points: 5, amountPaid: null, prizeAmount: 0 },
      ...outros.map((p, i) => ({
        stageId: "e2",
        playerId: p.id,
        points: 6 + i,
        amountPaid: null,
        prizeAmount: 0,
      })),
    ]);

    const ana = buildRanking([...players, ...outros], entries).find(
      (r) => r.player.id === "a",
    )!;
    expect(ana.stagesPlayed).toBe(2);
    expect(ana.averagePoints).toBe(26.5); // (48 + 5) / 2
    expect(ana.averagePlacement).toBe(9); // (2 + 16) / 2
    expect(ana.bestPlacement).toBe(2);
    // Somas brutas para reagregar médias entre temporadas: agora TODA etapa
    // jogada tem colocação, então placedStages = stagesPlayed.
    expect(ana.placementSum).toBe(18);
    expect(ana.placedStages).toBe(2);
  });

  it("derivePlacements empata quem fez os mesmos pontos e pula a seguinte", () => {
    const colocacoes = derivePlacements([
      { stageId: "e1", playerId: "a", points: 55 },
      { stageId: "e1", playerId: "b", points: 28 },
      { stageId: "e1", playerId: "c", points: 28 },
      { stageId: "e1", playerId: "d", points: 5 },
      { stageId: "e1", playerId: "e", points: 5 },
      // Outra etapa não interfere na contagem da primeira.
      { stageId: "e2", playerId: "a", points: 5 },
    ]);
    expect(colocacoes.map((r) => r.placement)).toEqual([1, 2, 2, 4, 4, 1]);
  });

  it("colocação registrada abaixo do corte vence a dedução", () => {
    // A liga anotou a ordem real do fundo da mesa: 22º não vira 3º só porque
    // apenas duas pessoas pontuaram mais naquela etapa.
    const colocacoes = derivePlacements([
      { stageId: "e1", playerId: "a", points: 55, placement: 1 },
      { stageId: "e1", playerId: "b", points: 48, placement: 2 },
      { stageId: "e1", playerId: "c", points: 5, placement: 22 },
      { stageId: "e1", playerId: "d", points: 5, placement: null },
    ]);
    expect(colocacoes.map((r) => r.placement)).toEqual([1, 2, 22, 3]);
  });

  it("conta etapas sem valor gasto informado, sem somar zero no total pago", () => {
    const players = [player("a", "Ana")];
    const entries = [entry("e1", "a", 1, 55, null, 1000), entry("e2", "a", 4, 38, 300, 150)];

    const [ana] = buildRanking(players, entries);
    expect(ana.stagesMissingFinancials).toBe(1);
    expect(ana.totalPaid).toBe(300);
    expect(ana.totalReceived).toBe(1150);
  });

  it("mantém jogadores cadastrados que ainda não jogaram, no fim da lista", () => {
    const players = [player("a", "Ana"), player("z", "Zeca")];
    const ranking = buildRanking(players, [entry("e1", "a", 1, 55)]);

    expect(ranking[1].player.fullName).toBe("Zeca");
    expect(ranking[1].stagesPlayed).toBe(0);
    expect(ranking[1].averagePlacement).toBeNull();
    expect(ranking[1].averagePoints).toBe(0);
  });
});

describe("displayPosition — colocação exibida com empates", () => {
  it("mesma pontuação = mesma colocação, e a seguinte pula (1, 2, 2, 4)", () => {
    const players = [player("a", "Ana"), player("b", "Bruno"), player("c", "Célia"), player("d", "Davi")];
    const entries = [
      entry("e1", "a", 1, 55),
      entry("e1", "b", 2, 48),
      entry("e2", "c", 2, 48),
      entry("e1", "d", 5, 33),
    ];

    const ranking = buildRanking(players, entries);
    const porNome = new Map(ranking.map((r) => [r.player.fullName, r]));

    expect(porNome.get("Ana")!.displayPosition).toBe(1);
    expect(porNome.get("Bruno")!.displayPosition).toBe(2);
    expect(porNome.get("Célia")!.displayPosition).toBe(2); // empatada com Bruno
    expect(porNome.get("Davi")!.displayPosition).toBe(4); // pula o 3º
  });

  it("empate no topo: dois 1º e o seguinte é 3º", () => {
    const players = [player("a", "Ana"), player("b", "Bruno"), player("c", "Célia")];
    const entries = [
      entry("e1", "a", 1, 55),
      entry("e2", "b", 1, 55),
      entry("e1", "c", 2, 48),
    ];

    const ranking = buildRanking(players, entries);
    const porNome = new Map(ranking.map((r) => [r.player.fullName, r]));

    expect(porNome.get("Ana")!.displayPosition).toBe(1);
    expect(porNome.get("Bruno")!.displayPosition).toBe(1);
    expect(porNome.get("Célia")!.displayPosition).toBe(3); // pula o 2º
    // Os três continuam no pódio (colocação de 1 a 3).
    expect(ranking.filter((r) => r.displayPosition >= 1 && r.displayPosition <= 3)).toHaveLength(3);
  });

  it("três empatados em 2º (1, 2, 2, 2): o pódio fica com 4 cards", () => {
    const players = [
      player("a", "Ana"),
      player("b", "Bruno"),
      player("c", "Célia"),
      player("d", "Davi"),
      player("e", "Elias"),
    ];
    const entries = [
      entry("e1", "a", 1, 55),
      entry("e1", "b", 2, 48),
      entry("e2", "c", 2, 48),
      entry("e3", "d", 2, 48),
      entry("e1", "e", 5, 33),
    ];

    const ranking = buildRanking(players, entries);
    const noPodio = ranking.filter((r) => r.displayPosition >= 1 && r.displayPosition <= 3);

    expect(noPodio).toHaveLength(4);
    expect(noPodio.map((r) => r.displayPosition)).toEqual([1, 2, 2, 2]);
    // Quem vem depois do trio empatado é o 5º, não o 3º.
    expect(ranking.find((r) => r.player.fullName === "Elias")!.displayPosition).toBe(5);
  });

  it("empate no 3º lugar mantém os dois no pódio (4 jogadores)", () => {
    const players = [
      player("a", "Ana"),
      player("b", "Bruno"),
      player("c", "Célia"),
      player("d", "Davi"),
    ];
    const entries = [
      entry("e1", "a", 1, 55),
      entry("e1", "b", 2, 48),
      entry("e1", "c", 3, 43),
      entry("e2", "d", 3, 43),
    ];

    const ranking = buildRanking(players, entries);
    const noPodio = ranking.filter((r) => r.displayPosition >= 1 && r.displayPosition <= 3);
    expect(noPodio).toHaveLength(4);
    expect(noPodio.map((r) => r.displayPosition)).toEqual([1, 2, 3, 3]);
  });

  it("a ordem da lista continua única (position), mesmo com colocação repetida", () => {
    const players = [player("a", "Ana"), player("b", "Bruno")];
    const entries = [entry("e1", "a", 2, 48), entry("e2", "b", 2, 48)];

    const ranking = buildRanking(players, entries);
    expect(ranking.map((r) => r.position)).toEqual([1, 2]);
    expect(ranking.map((r) => r.displayPosition)).toEqual([1, 1]);
  });

  it("quem não jogou fica sem colocação exibida", () => {
    const ranking = buildRanking([player("a", "Ana"), player("z", "Zeca")], [
      entry("e1", "a", 1, 55),
    ]);
    expect(ranking[1].stagesPlayed).toBe(0);
    expect(ranking[1].displayPosition).toBe(0);
  });
});

describe("melhor colocação e quantas vezes a atingiu", () => {
  it("conta as repetições da melhor colocação", () => {
    const players = [player("a", "Ana")];
    const entries = [
      entry("e1", "a", 3, 43),
      entry("e2", "a", 3, 43),
      entry("e3", "a", 7, 23),
    ];

    const [ana] = buildRanking(players, entries);
    expect(ana.bestPlacement).toBe(3);
    expect(ana.bestPlacementCount).toBe(2);
  });

  it("quem não jogou nenhuma etapa não tem melhor colocação", () => {
    const [ana] = buildRanking([player("a", "Ana")], []);
    expect(ana.bestPlacement).toBeNull();
    expect(ana.bestPlacementCount).toBe(0);
  });
});

describe("critério de desempate", () => {
  it("empate em pontos: vence quem tem mais etapas ganhas", () => {
    const players = [player("a", "Ana"), player("b", "Bruno")];
    const entries = [
      // Ana: 1º (55) + 15º (6) = 61, com uma vitória.
      entry("e1", "a", 1, 55),
      entry("e2", "a", 15, 6),
      // Bruno: 5º (33) + 6º (28) = 61, sem nenhuma vitória.
      entry("e1", "b", 5, 33),
      entry("e2", "b", 6, 28),
    ];

    const ranking = buildRanking(players, entries);
    expect(ranking[0].totalPoints).toBe(61);
    expect(ranking[0].totalPoints).toBe(ranking[1].totalPoints);
    expect(ranking[0].player.fullName).toBe("Ana");
  });

  it("sem vitórias para nenhum: vence quem tem mais 2º lugares", () => {
    const players = [player("a", "Ana"), player("b", "Bruno")];
    const entries = [
      entry("e1", "a", 2, 48), // um 2º lugar
      entry("e1", "b", 3, 43),
      entry("e2", "b", 15, 5),
    ];

    const ranking = buildRanking(players, entries);
    expect(ranking[0].totalPoints).toBe(48);
    expect(ranking[1].totalPoints).toBe(48);
    expect(ranking[0].player.fullName).toBe("Ana");
  });

  it("último critério é o nome, para a ordem nunca ser aleatória", () => {
    const players = [player("z", "Zeca"), player("a", "Ana")];
    const entries = [entry("e1", "a", 1, 5), entry("e1", "z", 1, 5)];

    const ranking = buildRanking(players, entries);
    expect(ranking.map((r) => r.player.fullName)).toEqual(["Ana", "Zeca"]);
  });

  it("reproduz os empates reais de 2026 (Rodolfo × Rodrigo, 116 pontos)", () => {
    // Pontos exatos da planilha, etapa a etapa.
    const players = [player("rodolfo", "Rodolfo Negrão"), player("rodrigo", "Rodrigo Miranda")];
    const rodolfo = [7, 5, 5, 38, 23, 38];
    const rodrigo = [0, 43, 5, 5, 15, 48];

    const entries: RankingEntry[] = [];
    rodolfo.forEach((p, i) => {
      if (p > 0) entries.push(entry(`e${i}`, "rodolfo", placementOf(p) ?? 16, p));
    });
    rodrigo.forEach((p, i) => {
      if (p > 0) entries.push(entry(`e${i}`, "rodrigo", placementOf(p) ?? 16, p));
    });

    const ranking = buildRanking(players, entries);
    expect(ranking[0].totalPoints).toBe(116);
    expect(ranking[1].totalPoints).toBe(116);
    // Nenhum dos dois venceu etapa nem foi 2º; Rodrigo tem um 2º lugar (48 pts),
    // então ele fica à frente pelo critério de desempate.
    expect(ranking[0].player.fullName).toBe("Rodrigo Miranda");
  });
});

/** Colocação a partir dos pontos, usando a tabela padrão — auxiliar do teste. */
function placementOf(points: number): number | null {
  const table: Record<number, number> = {
    55: 1, 48: 2, 43: 3, 38: 4, 33: 5, 28: 6, 23: 7, 20: 8,
    17: 9, 15: 10, 13: 11, 11: 12, 9: 13, 7: 14, 6: 15,
  };
  return table[points] ?? null;
}

describe("reserva acumulada da temporada", () => {
  it("soma a reserva já calculada de cada etapa regular", () => {
    const stages = [650, 1000, 900, 810, 1150, 700].map((reserve) => ({
      reserve,
      isFinal: false,
    }));
    expect(accumulatedFinalReserve(stages)).toBe(5210);
  });

  it("a própria Etapa Final não gera reserva nova", () => {
    expect(
      accumulatedFinalReserve([
        { reserve: 650, isFinal: false },
        { reserve: 2000, isFinal: true },
      ]),
    ).toBe(650);
  });
});

describe("sugestão de convidados da Etapa Final", () => {
  it("pega os N primeiros considerando só as etapas até o corte de Outubro", () => {
    const players = [player("a", "Ana"), player("b", "Bruno"), player("c", "Célia")];
    const entries = [
      entry("out", "a", 1, 55),
      entry("out", "b", 2, 48),
      entry("out", "c", 3, 43),
      // Etapa posterior ao corte: não pode influenciar a lista.
      entry("nov", "c", 1, 55),
    ];

    const convidados = suggestFinalInvitees(players, entries, ["out"], 2);
    expect(convidados.map((r) => r.player.fullName)).toEqual(["Ana", "Bruno"]);
  });

  it("não sugere quem nunca jogou", () => {
    const players = [player("a", "Ana"), player("z", "Zeca")];
    const convidados = suggestFinalInvitees(players, [entry("e1", "a", 1, 55)], ["e1"], 20);
    expect(convidados.map((r) => r.player.fullName)).toEqual(["Ana"]);
  });
});

describe("re-buys e add-ons", () => {
  function extra(
    stageId: string,
    playerId: string,
    placement: number,
    points: number,
    rebuys: number | null,
    hadAddon: boolean | null,
  ): RankingEntry {
    return { stageId, playerId, placement, points, amountPaid: null, prizeAmount: 0, rebuys, hadAddon };
  }

  it("soma re-buys e add-ons e calcula a média por etapa registrada", () => {
    const entries = [
      extra("e1", "a", 1, 55, 2, true),
      extra("e2", "a", 4, 38, 0, false),
      extra("e3", "a", 7, 23, 1, true),
    ];
    const [ana] = buildRanking([player("a", "Ana")], entries);
    expect(ana.totalRebuys).toBe(3);
    expect(ana.totalAddons).toBe(2);
    expect(ana.extrasRecordedStages).toBe(3);
    expect(ana.stagesMissingExtras).toBe(0);
    expect(ana.averageRebuys).toBe(1); // 3 ÷ 3
  });

  it("zero re-buy conta como registro; os dois campos em branco, não", () => {
    const [ana] = buildRanking(
      [player("a", "Ana")],
      [extra("e1", "a", 1, 55, 0, false), extra("e2", "a", 4, 38, null, null)],
    );
    expect(ana.extrasRecordedStages).toBe(1);
    expect(ana.stagesMissingExtras).toBe(1);
    expect(ana.totalRebuys).toBe(0);
  });

  it("etapa importada da planilha (sem os campos) não conta como registrada", () => {
    const [ana] = buildRanking([player("a", "Ana")], [entry("e1", "a", 1, 55)]);
    expect(ana.stagesMissingExtras).toBe(1);
    expect(ana.averageRebuys).toBeNull();
  });

  it("desempata pelo total de re-buys + add-ons: menos vence", () => {
    // Mesmos pontos, mesmas colocações — só o gasto em fichas difere. O
    // econômico é "Zeca" DE PROPÓSITO: se o critério não funcionasse, a ordem
    // alfabética colocaria Ana na frente e o teste passaria à toa.
    const players = [player("gastador", "Ana"), player("economico", "Zeca")];
    const entries = [
      extra("e1", "gastador", 3, 43, 3, true),
      extra("e2", "gastador", 5, 33, 2, true),
      extra("e1", "economico", 3, 43, 0, false),
      extra("e2", "economico", 5, 33, 1, false),
    ];
    const ranking = buildRanking(players, entries);
    expect(ranking[0].totalPoints).toBe(ranking[1].totalPoints);
    expect(ranking.map((r) => r.player.fullName)).toEqual(["Zeca", "Ana"]);
  });

  it("o desempate é IGNORADO quando um dos dois tem etapa sem lançamento", () => {
    // Ana teve tudo lançado e fez 5 re-buys. Zeca só teve UMA etapa lançada,
    // com 0 re-buys — se o critério valesse, ele passaria na frente por um
    // dado que não existe. O certo é cair na ordem alfabética: Ana primeiro.
    const players = [player("z", "Zeca"), player("a", "Ana")];
    const entries = [
      extra("e1", "a", 3, 43, 5, true),
      extra("e2", "a", 5, 33, 0, false),
      extra("e1", "z", 3, 43, 0, false),
      extra("e2", "z", 5, 33, null, null),
    ];
    const ranking = buildRanking(players, entries);
    expect(temExtrasCompletos(ranking.find((r) => r.player.id === "z")!)).toBe(false);
    expect(temExtrasCompletos(ranking.find((r) => r.player.id === "a")!)).toBe(true);
    expect(ranking.map((r) => r.player.fullName)).toEqual(["Ana", "Zeca"]);
  });

  it("o desempate por re-buys só entra DEPOIS das colocações", () => {
    // Zeca tem uma vitória e mais re-buys; a vitória vale mais.
    const players = [player("z", "Zeca"), player("a", "Ana")];
    const entries = [
      extra("e1", "z", 1, 55, 4, true),
      extra("e2", "z", 12, 11, 4, true),
      extra("e1", "a", 2, 48, 0, false),
      extra("e2", "a", 9, 18, 0, false),
    ];
    const ranking = buildRanking(players, entries);
    expect(ranking[0].totalPoints).toBe(ranking[1].totalPoints); // 66 cada
    expect(ranking[0].player.fullName).toBe("Zeca");
  });
});
