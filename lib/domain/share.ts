/**
 * Mensagens prontas para compartilhar no WhatsApp.
 *
 * Só texto e regras de formatação — nada de DOM ou rede —, para poder ser
 * testado sem navegador. O WhatsApp entende *negrito* e _itálico_ com esses
 * marcadores; o resto é texto puro com emojis.
 */

/** Uma participação, do jeito que o admin preencheu (colocação pode faltar). */
export interface ShareEntry {
  name: string;
  /** Colocação final na etapa. null = ainda na mesa (não foi eliminado). */
  placement: number | null;
  /** Pontos que a colocação vale. */
  points: number;
}

/** Medalha das três primeiras colocações; vazio para as demais. */
function medal(placement: number): string {
  if (placement === 1) return "🥇";
  if (placement === 2) return "🥈";
  if (placement === 3) return "🥉";
  return "";
}

/**
 * Monta a mensagem de uma etapa para o WhatsApp.
 *
 * Serve tanto para o **parcial** (enquanto há gente na mesa) quanto para o
 * **resultado final** (todos eliminados) — a diferença é detectada pela
 * presença de participantes sem colocação:
 *
 *  - Quem tem colocação = já foi eliminado (no poker, o 1º a cair leva a PIOR
 *    colocação). Aparece na classificação, do melhor para o pior.
 *  - Quem NÃO tem colocação = segue jogando. Aparece em "Na mesa".
 */
export function buildStageMessage(stageLabel: string, entries: ShareEntry[]): string {
  const naMesa = entries.filter((e) => e.placement === null);
  const eliminados = entries
    .filter((e): e is ShareEntry & { placement: number } => e.placement !== null)
    .sort((a, b) => a.placement - b.placement);

  const parcial = naMesa.length > 0;
  const linhas: string[] = [];

  linhas.push(`🃏 *${stageLabel}*`);
  linhas.push(
    parcial
      ? `_Parcial • ${naMesa.length} ${naMesa.length === 1 ? "jogador na mesa" : "jogadores na mesa"}_`
      : "_Resultado final_ 🏆",
  );

  if (parcial) {
    linhas.push("");
    linhas.push(`🟢 *Na mesa (${naMesa.length})*`);
    // Ordem alfabética: ninguém "na frente" enquanto o jogo não acaba.
    for (const jogador of [...naMesa].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))) {
      linhas.push(jogador.name);
    }
  }

  if (eliminados.length > 0) {
    linhas.push("");
    linhas.push(parcial ? "🔴 *Eliminados*" : "*Classificação*");
    for (const e of eliminados) {
      const m = medal(e.placement);
      const prefixo = `${e.placement}º${m ? ` ${m}` : ""}`;
      linhas.push(`${prefixo} ${e.name} — ${e.points} pts`);
    }
  }

  if (entries.length === 0) {
    linhas.push("");
    linhas.push("_Nenhum participante lançado ainda._");
  }

  return linhas.join("\n");
}

/** Uma linha do ranking, reduzida ao que a mensagem precisa. */
export interface ShareRankingRow {
  position: number;
  name: string;
  points: number;
  /** Etapas jogadas — vira "(N etapas)" ao lado do nome. */
  stagesPlayed: number;
}

/**
 * Ranking resumido para o WhatsApp. `limit` corta a lista (0 = todos) porque
 * uma mensagem com 60 nomes ninguém lê — o padrão mostra o pelotão da frente.
 */
export function buildRankingMessage(
  title: string,
  rows: ShareRankingRow[],
  limit = 12,
): string {
  const jogaram = rows.filter((r) => r.stagesPlayed > 0);
  const mostrados = limit > 0 ? jogaram.slice(0, limit) : jogaram;

  const linhas: string[] = [`🏆 *${title}*`, ""];
  for (const row of mostrados) {
    const m = medal(row.position);
    const prefixo = `${row.position}º${m ? ` ${m}` : ""}`;
    linhas.push(`${prefixo} ${row.name} — ${row.points} pts`);
  }
  if (limit > 0 && jogaram.length > mostrados.length) {
    linhas.push("");
    linhas.push(`_… e mais ${jogaram.length - mostrados.length} jogadores._`);
  }
  return linhas.join("\n");
}

/** Link wa.me que abre o WhatsApp com a mensagem pronta para enviar. */
export function whatsappLink(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}
