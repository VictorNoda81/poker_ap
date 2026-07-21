import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseRosterWorkbook, splitClassification } from "./parse-roster";

const DATA = path.resolve(__dirname, "../../data");

describe("splitClassification", () => {
  it("separa nome e letra", () => {
    expect(splitClassification("LIGIA - C")).toEqual({ name: "LIGIA", letter: "C" });
    expect(splitClassification("RODOLFO NEGRÃO - A")).toEqual({ name: "RODOLFO NEGRÃO", letter: "A" });
  });

  it("tolera espaços extras e caixa da letra", () => {
    expect(splitClassification("KIRIL  - c")).toEqual({ name: "KIRIL", letter: "C" });
  });

  it("preserva apelido entre parênteses no nome", () => {
    expect(splitClassification("PEDRO LINS (PEU) - C")).toEqual({
      name: "PEDRO LINS (PEU)",
      letter: "C",
    });
  });

  it("devolve null quando não há marca A/C", () => {
    expect(splitClassification("FULANO DE TAL")).toBeNull();
    expect(splitClassification("NOME - X")).toBeNull();
  });
});

describe("parseRosterWorkbook (planilha real de 2026)", () => {
  const roster = parseRosterWorkbook(path.join(DATA, "2026-classificacao.xlsx"));

  it("lê os 56 jogadores classificados", () => {
    expect(roster).toHaveLength(56);
  });

  it("A vira sócio e C vira convidado", () => {
    const socios = roster.filter((r) => r.classification === "socio");
    const convidados = roster.filter((r) => r.classification === "convidado");
    expect(socios).toHaveLength(23);
    expect(convidados).toHaveLength(33);
  });

  it("normaliza o nome sem o sufixo", () => {
    const ligia = roster.find((r) => r.name === "Ligia");
    expect(ligia?.classification).toBe("convidado");
    const rodolfo = roster.find((r) => r.name === "Rodolfo Negrão");
    expect(rodolfo?.classification).toBe("socio");
  });
});
