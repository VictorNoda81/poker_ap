import { describe, expect, it } from "vitest";
import {
  accumulatedFinalReserve,
  buildRanking,
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
  placement: number | null,
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

  it("colocação nula ('16º ou pior') entra na média de pontos mas não na de classificação", () => {
    const players = [player("a", "Ana")];
    const entries = [entry("e1", "a", 2, 48), entry("e2", "a", null, 5)];

    const [ana] = buildRanking(players, entries);
    expect(ana.stagesPlayed).toBe(2);
    expect(ana.averagePoints).toBe(26.5); // (48 + 5) / 2
    expect(ana.averagePlacement).toBe(2); // só a etapa com colocação registrada
    expect(ana.bestPlacement).toBe(2);
    // Somas brutas expostas para reagregar médias entre temporadas: a etapa
    // "16º+" fica de fora da soma de colocações e da contagem de etapas colocadas.
    expect(ana.placementSum).toBe(2);
    expect(ana.placedStages).toBe(1);
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

  it("a ordem da lista continua única, mesmo com colocação repetida", () => {
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

  it("sem colocação registrada, não há melhor colocação", () => {
    const [ana] = buildRanking([player("a", "Ana")], [entry("e1", "a", null, 5)]);
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
    const entries = [entry("e1", "a", null, 5), entry("e1", "z", null, 5)];

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
      if (p > 0) entries.push(entry(`e${i}`, "rodolfo", p === 5 ? null : placementOf(p), p));
    });
    rodrigo.forEach((p, i) => {
      if (p > 0) entries.push(entry(`e${i}`, "rodrigo", p === 5 ? null : placementOf(p), p));
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
  it("soma os 10% de todas as etapas regulares de 2026", () => {
    const stages = [6500, 10000, 9000, 8100, 11500, 7000].map((gross) => ({
      gross,
      isFinal: false,
    }));
    expect(accumulatedFinalReserve(stages, 10)).toBe(5210);
  });

  it("a própria Etapa Final não gera reserva nova", () => {
    const stages = [
      { gross: 6500, isFinal: false },
      { gross: 20000, isFinal: true },
    ];
    expect(accumulatedFinalReserve(stages, 10)).toBe(650);
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
