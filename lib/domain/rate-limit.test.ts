import { describe, expect, it } from "vitest";
import {
  JANELA_MINUTOS,
  MAX_TENTATIVAS,
  avaliarLimite,
  formatarEspera,
  type TentativaLogin,
} from "./rate-limit";

const AGORA = new Date("2026-07-18T20:00:00Z");

/** Uma tentativa há N minutos. */
function ha(minutos: number, succeeded = false): TentativaLogin {
  return { at: new Date(AGORA.getTime() - minutos * 60_000), succeeded };
}

describe("avaliarLimite", () => {
  it("libera quando não houve nenhuma tentativa", () => {
    expect(avaliarLimite([], AGORA)).toEqual({
      bloqueado: false,
      restantes: 3,
      liberaEmSegundos: 0,
    });
  });

  it("desconta as tentativas restantes a cada erro", () => {
    expect(avaliarLimite([ha(1)], AGORA).restantes).toBe(2);
    expect(avaliarLimite([ha(1), ha(2)], AGORA).restantes).toBe(1);
  });

  it("bloqueia exatamente na terceira falha", () => {
    const estado = avaliarLimite([ha(1), ha(2), ha(3)], AGORA);
    expect(estado.bloqueado).toBe(true);
    expect(estado.restantes).toBe(0);
  });

  it("não bloqueia com duas falhas", () => {
    expect(avaliarLimite([ha(1), ha(2)], AGORA).bloqueado).toBe(false);
  });

  it("ignora falhas mais velhas que a janela", () => {
    // Três falhas, mas todas fora dos 15 minutos.
    const estado = avaliarLimite([ha(20), ha(25), ha(30)], AGORA);
    expect(estado.bloqueado).toBe(false);
    expect(estado.restantes).toBe(3);
  });

  it("conta só as falhas dentro da janela", () => {
    const estado = avaliarLimite([ha(1), ha(2), ha(60)], AGORA);
    expect(estado.bloqueado).toBe(false);
    expect(estado.restantes).toBe(1);
  });

  it("um acerto zera o histórico de falhas", () => {
    // Errou duas vezes, acertou, depois errou de novo: só a última conta.
    const estado = avaliarLimite([ha(10), ha(9), ha(8, true), ha(1)], AGORA);
    expect(estado.bloqueado).toBe(false);
    expect(estado.restantes).toBe(2);
  });

  it("um acerto destrava quem estava bloqueado", () => {
    const estado = avaliarLimite([ha(10), ha(9), ha(8), ha(5, true)], AGORA);
    expect(estado.bloqueado).toBe(false);
    expect(estado.restantes).toBe(3);
  });

  it("informa quanto falta para liberar", () => {
    // A falha mais antiga que conta foi há 5 min; libera 10 min depois.
    const estado = avaliarLimite([ha(5), ha(4), ha(3)], AGORA);
    expect(estado.bloqueado).toBe(true);
    expect(estado.liberaEmSegundos).toBe(10 * 60);
  });

  it("libera sozinho quando a falha mais antiga envelhece", () => {
    const tentativas = [ha(16), ha(4), ha(3)];
    // A de 16 minutos saiu da janela, sobraram duas.
    const estado = avaliarLimite(tentativas, AGORA);
    expect(estado.bloqueado).toBe(false);
    expect(estado.restantes).toBe(1);
  });

  it("o bloqueio expira sozinho, sem depender de a pessoa parar de tentar", () => {
    // Três falhas há 14 minutos. Tentativas feitas DURANTE o bloqueio não são
    // registradas (ver `recordLoginAttempt`), então a lista não cresce e as
    // falhas originais envelhecem normalmente.
    const tentativas = [ha(14), ha(14), ha(14)];
    expect(avaliarLimite(tentativas, AGORA).bloqueado).toBe(true);

    const daquiADoisMinutos = new Date(AGORA.getTime() + 2 * 60_000);
    expect(avaliarLimite(tentativas, daquiADoisMinutos).bloqueado).toBe(false);
  });

  it("com a janela deslizante, tentativas registradas seguidas mantêm o bloqueio", () => {
    // Documenta por que tentativas durante o bloqueio não podem ser gravadas:
    // se fossem, o bloqueio se renovaria a cada nova tentativa.
    const insistindo = [ha(14), ha(14), ha(14), ha(10), ha(5), ha(1)];
    const daquiADoisMinutos = new Date(AGORA.getTime() + 2 * 60_000);
    expect(avaliarLimite(insistindo, daquiADoisMinutos).bloqueado).toBe(true);
  });

  it("respeita limite e janela customizados", () => {
    expect(avaliarLimite([ha(1)], AGORA, 1, 15).bloqueado).toBe(true);
    expect(avaliarLimite([ha(1), ha(2), ha(3)], AGORA, 3, 1).bloqueado).toBe(false);
  });

  it("usa 3 tentativas e 15 minutos como padrão", () => {
    expect(MAX_TENTATIVAS).toBe(3);
    expect(JANELA_MINUTOS).toBe(15);
  });
});

describe("formatarEspera", () => {
  it("mostra segundos abaixo de um minuto", () => {
    expect(formatarEspera(45)).toBe("45 segundos");
    expect(formatarEspera(1)).toBe("1 segundo");
  });

  it("arredonda para cima em minutos", () => {
    expect(formatarEspera(60)).toBe("1 minuto");
    expect(formatarEspera(61)).toBe("2 minutos");
    expect(formatarEspera(600)).toBe("10 minutos");
  });
});
