/**
 * Testes de integração da importação: leem as planilhas reais em `data/` e
 * conferem o resultado contra os números que aparecem nelas.
 *
 * É esta suíte que garante que o seed não distorce os dados históricos.
 */

import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildRanking, type RankingEntry, type RankingPlayer } from "../domain/ranking";
import { parseRankingWorkbook, playerKey } from "./parse-ranking";

const DATA = path.resolve(__dirname, "../../data");

/** Reconstrói o total de pontos por jogador via o mesmo código do app. */
function totaisPeloApp(parsed: ReturnType<typeof parseRankingWorkbook>) {
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
  return buildRanking(players, entries);
}

describe.each([
  {
    ano: 2023,
    arquivo: "2023.xlsx",
    jogadores: 67,
    etapas: 10,
    reserva: 6965,
    lider: ["André Armani", 373],
  },
  {
    // 56, não 57: a planilha lista Fábio Segura em duas linhas (com e sem
    // acento); o parser funde a mesma pessoa num só cadastro.
    ano: 2024,
    arquivo: "2024.xlsx",
    jogadores: 56,
    etapas: 9,
    reserva: 5641,
    lider: null, // conferido só pelo total geral
  },
  {
    ano: 2025,
    arquivo: "2025.xlsx",
    jogadores: 69,
    etapas: 9,
    reserva: 6550,
    lider: null,
  },
  {
    ano: 2026,
    arquivo: "2026.xlsx",
    jogadores: 56,
    etapas: 7,
    reserva: 5210,
    lider: ["Ligia", 174],
  },
])("temporada $ano", ({ arquivo, jogadores, etapas, reserva, lider }) => {
  const parsed = parseRankingWorkbook(path.join(DATA, arquivo));

  it("importa o número esperado de jogadores e etapas", () => {
    expect(parsed.players).toHaveLength(jogadores);
    expect(parsed.stages).toHaveLength(etapas);
  });

  it("a reserva acumulada da temporada bate com a planilha", () => {
    const total = parsed.stages.reduce((s, e) => s + (e.reserveAmount ?? 0), 0);
    expect(total).toBe(reserva);
  });

  it("todas as etapas realizadas têm arrecadação = 10× a reserva", () => {
    for (const stage of parsed.stages) {
      if (stage.reserveAmount === null) continue;
      expect(stage.grossAmount).toBe(stage.reserveAmount * 10);
    }
  });

  it("o total de pontos de cada jogador reproduz a planilha", () => {
    const ranking = totaisPeloApp(parsed);
    for (const row of ranking) {
      expect(row.totalPoints).toBe(parsed.spreadsheetTotals.get(row.player.fullName));
    }
  });

  if (lider) {
    it(`o líder é ${lider[0]} com ${lider[1]} pontos`, () => {
      const ranking = totaisPeloApp(parsed);
      expect(ranking[0].player.fullName).toBe(lider[0]);
      expect(ranking[0].totalPoints).toBe(lider[1]);
    });
  }

  it("não repete nome dentro da própria temporada", () => {
    const unicos = new Set(parsed.players.map((n) => n.toLowerCase()));
    expect(unicos.size).toBe(parsed.players.length);
  });
});

describe("anomalias conhecidas das planilhas viram revisão", () => {
  it("2023: os 42 pontos de Alexandre Max (typo de 43) são marcados", () => {
    const parsed = parseRankingWorkbook(path.join(DATA, "2023.xlsx"));
    const r = parsed.results.find((x) => x.playerName === "Alexandre Max" && x.points === 42);
    expect(r).toBeDefined();
    expect(r!.needsReview).toBe(true);
    expect(r!.placement).toBeNull();
  });

  it("2024: os pontos fora da tabela (16 e 10) são marcados", () => {
    const parsed = parseRankingWorkbook(path.join(DATA, "2024.xlsx"));
    const anomalos = parsed.results.filter((x) => x.points === 16 || x.points === 10);
    expect(anomalos.length).toBeGreaterThan(0);
    expect(anomalos.every((x) => x.needsReview)).toBe(true);
  });

  it("2024: Fábio Segura, listado em duas linhas, vira um só com 15 pontos", () => {
    const parsed = parseRankingWorkbook(path.join(DATA, "2024.xlsx"));
    const nomes = parsed.players.filter((n) => n.toLowerCase().includes("segura"));
    expect(nomes).toEqual(["Fábio Segura"]); // grafia com acento vence
    expect(parsed.spreadsheetTotals.get("Fábio Segura")).toBe(15); // 5 + 10
    // As duas participações (etapas distintas) ficam marcadas para revisão.
    const dele = parsed.results.filter((r) => r.playerName === "Fábio Segura");
    expect(dele).toHaveLength(2);
    expect(dele.every((r) => r.needsReview)).toBe(true);
  });

  it("2025: a planilha está limpa, sem pontuação fora da tabela", () => {
    const parsed = parseRankingWorkbook(path.join(DATA, "2025.xlsx"));
    const foraDaTabela = parsed.results.filter(
      (x) => x.needsReview && x.reviewNote?.includes("não corresponde"),
    );
    expect(foraDaTabela).toHaveLength(0);
  });
});

describe("playerKey — identidade entre temporadas", () => {
  it("ignora acento", () => {
    expect(playerKey("André Echeverria")).toBe(playerKey("Andre Echeverria"));
    expect(playerKey("Fábio Segura")).toBe(playerKey("FABIO SEGURA"));
  });

  it("ignora apelido entre parênteses", () => {
    expect(playerKey("José Olimpio (JOB)")).toBe(playerKey("José Olimpio"));
    expect(playerKey("Pedro Lins (Peu)")).toBe("pedro lins");
  });

  it("ignora caixa e espaços", () => {
    expect(playerKey("  RODOLFO   NEGRÃO ")).toBe("rodolfo negrao");
  });

  it("NÃO funde apelidos puros — decisão que a planilha não permite tomar", () => {
    // "Wagner (Wawa)" vira "wagner"; "Wawa" continua "wawa". Ficam separados.
    expect(playerKey("Wagner (Wawa)")).not.toBe(playerKey("Wawa"));
  });

  it("mantém pessoas diferentes separadas", () => {
    expect(playerKey("Fábio Segura")).not.toBe(playerKey("Fábio Tieza"));
    expect(playerKey("Rodrigo Pinotti")).not.toBe(playerKey("Rodrigo Toledo"));
  });
});
