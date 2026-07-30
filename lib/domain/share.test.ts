import { describe, expect, it } from "vitest";
import {
  buildRankingMessage,
  buildStageMessage,
  whatsappLink,
  type ShareEntry,
  type ShareRankingRow,
} from "./share";

const e = (name: string, placement: number | null, points: number): ShareEntry => ({
  name,
  placement,
  points,
});

describe("buildStageMessage", () => {
  it("no parcial, separa quem está na mesa de quem foi eliminado", () => {
    const msg = buildStageMessage("Etapa 7 - Jul/26", [
      e("Ana", null, 0),
      e("Bruno", null, 0),
      e("Caio", 5, 33), // eliminado em 5º
      e("Davi", 6, 28), // eliminado em 6º
    ]);
    expect(msg).toContain("*Etapa 7 - Jul/26*");
    expect(msg).toContain("Parcial • 2 jogadores na mesa");
    expect(msg).toContain("🟢 *Na mesa (2)*");
    expect(msg).toContain("🔴 *Eliminados*");
    // Eliminados do melhor para o pior.
    expect(msg.indexOf("5º Caio")).toBeLessThan(msg.indexOf("6º Davi"));
    expect(msg).toContain("5º Caio — 33 pts");
  });

  it("na mesa fica em ordem alfabética", () => {
    const msg = buildStageMessage("E", [e("Zeca", null, 0), e("Ana", null, 0)]);
    expect(msg.indexOf("Ana")).toBeLessThan(msg.indexOf("Zeca"));
  });

  it("com todos eliminados, vira resultado final com medalhas", () => {
    const msg = buildStageMessage("Etapa 1", [
      e("Ana", 1, 55),
      e("Bruno", 2, 48),
      e("Caio", 3, 43),
      e("Davi", 4, 38),
    ]);
    expect(msg).toContain("_Resultado final_");
    expect(msg).not.toContain("Na mesa");
    expect(msg).toContain("1º 🥇 Ana — 55 pts");
    expect(msg).toContain("2º 🥈 Bruno");
    expect(msg).toContain("3º 🥉 Caio");
    expect(msg).toContain("4º Davi — 38 pts"); // sem medalha
  });

  it("sem participantes, avisa que nada foi lançado", () => {
    expect(buildStageMessage("E", [])).toContain("Nenhum participante lançado");
  });
});

describe("buildRankingMessage", () => {
  const rows: ShareRankingRow[] = [
    { position: 1, name: "Ana", points: 174, stagesPlayed: 6 },
    { position: 2, name: "Bruno", points: 164, stagesPlayed: 6 },
    { position: 3, name: "Caio", points: 121, stagesPlayed: 5 },
    { position: 4, name: "Davi", points: 90, stagesPlayed: 4 },
  ];

  it("lista o topo com medalhas nos três primeiros", () => {
    const msg = buildRankingMessage("Temporada 2026", rows);
    expect(msg).toContain("🏆 *Temporada 2026*");
    expect(msg).toContain("1º 🥇 Ana — 174 pts");
    expect(msg).toContain("4º Davi — 90 pts");
  });

  it("corta no limite e informa quantos sobraram", () => {
    const msg = buildRankingMessage("T", rows, 2);
    expect(msg).toContain("1º 🥇 Ana");
    expect(msg).toContain("2º 🥈 Bruno");
    expect(msg).not.toContain("Caio");
    expect(msg).toContain("e mais 2 jogadores");
  });

  it("ignora quem não jogou nenhuma etapa", () => {
    const comZerados = [...rows, { position: 5, name: "Ela", points: 0, stagesPlayed: 0 }];
    const msg = buildRankingMessage("T", comZerados, 0);
    expect(msg).not.toContain("Ela");
  });
});

describe("whatsappLink", () => {
  it("codifica a mensagem no parâmetro text", () => {
    const link = whatsappLink("Olá, mundo & cia");
    expect(link.startsWith("https://wa.me/?text=")).toBe(true);
    expect(link).toContain(encodeURIComponent("Olá, mundo & cia"));
  });
});
