/**
 * Limite de tentativas de login.
 *
 * Janela deslizante: contam as falhas dos últimos N minutos, desde o último
 * acerto. Ao atingir o limite, o acesso fica bloqueado até que a falha mais
 * antiga da janela envelheça e saia da conta.
 *
 * A janela deslizante é melhor que "bloqueia por 15 minutos a partir da última
 * tentativa": nesta segunda forma, quem continua tentando renova o próprio
 * bloqueio para sempre — inclusive o dono da senha, que fica trancado do lado
 * de fora sem entender por quê.
 *
 * Função pura, sem banco e sem relógio implícito: `now` entra como parâmetro,
 * o que torna o comportamento testável minuto a minuto.
 */

export const MAX_TENTATIVAS = 3;
export const JANELA_MINUTOS = 15;

export interface TentativaLogin {
  /** Momento da tentativa. */
  at: Date;
  /** true quando a senha estava correta. */
  succeeded: boolean;
}

export interface EstadoLimite {
  /** true quando novas tentativas devem ser recusadas sem nem checar a senha. */
  bloqueado: boolean;
  /** Quantas tentativas ainda restam antes do bloqueio. */
  restantes: number;
  /** Segundos até liberar. 0 quando não está bloqueado. */
  liberaEmSegundos: number;
}

export function avaliarLimite(
  tentativas: TentativaLogin[],
  now: Date = new Date(),
  maxTentativas: number = MAX_TENTATIVAS,
  janelaMinutos: number = JANELA_MINUTOS,
): EstadoLimite {
  const janelaMs = janelaMinutos * 60_000;
  const inicioDaJanela = now.getTime() - janelaMs;

  // Um login bem-sucedido zera o histórico: quem já provou saber a senha não
  // deve ser bloqueado por erros anteriores.
  const ultimoAcerto = tentativas
    .filter((t) => t.succeeded)
    .reduce<number>((maior, t) => Math.max(maior, t.at.getTime()), 0);

  const falhasRelevantes = tentativas
    .filter((t) => !t.succeeded)
    .filter((t) => t.at.getTime() > ultimoAcerto)
    .filter((t) => t.at.getTime() > inicioDaJanela)
    .sort((a, b) => a.at.getTime() - b.at.getTime());

  if (falhasRelevantes.length < maxTentativas) {
    return {
      bloqueado: false,
      restantes: maxTentativas - falhasRelevantes.length,
      liberaEmSegundos: 0,
    };
  }

  // Bloqueado. Libera quando a falha mais antiga que ainda conta sair da
  // janela — o que acontece mesmo que a pessoa continue tentando.
  const maisAntiga = falhasRelevantes[falhasRelevantes.length - maxTentativas];
  const liberaEm = maisAntiga.at.getTime() + janelaMs;

  return {
    bloqueado: true,
    restantes: 0,
    liberaEmSegundos: Math.max(1, Math.ceil((liberaEm - now.getTime()) / 1000)),
  };
}

/** "3 minutos", "45 segundos" — para a mensagem que o usuário lê. */
export function formatarEspera(segundos: number): string {
  if (segundos < 60) {
    return `${segundos} segundo${segundos === 1 ? "" : "s"}`;
  }
  const minutos = Math.ceil(segundos / 60);
  return `${minutos} minuto${minutos === 1 ? "" : "s"}`;
}
