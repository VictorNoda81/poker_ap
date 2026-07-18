/**
 * Nome de exibição das etapas.
 *
 * O nome nunca é armazenado no banco — sempre derivado do número da etapa e da
 * data do evento, para não ficar dessincronizado quando o admin edita a data.
 */

const MESES = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

const MESES_LONGOS = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/**
 * O Postgres devolve `date` como "2026-01-29". Passar isso para `new Date()`
 * interpreta como UTC meia-noite, que no fuso de Brasília vira 28/01 — e a
 * etapa aparece no mês errado na virada. Por isso parseamos na unha.
 */
export function parseDateParts(isoDate: string): { year: number; month: number; day: number } {
  const [year, month, day] = isoDate.slice(0, 10).split("-").map(Number);
  return { year, month, day };
}

/** "Etapa 7 - Jul/26" — ou "Etapa Final - Dez/26" quando `isFinal`. */
export function stageName(number: number, isoDate: string, isFinal = false): string {
  const { year, month } = parseDateParts(isoDate);
  const mes = MESES[month - 1] ?? "???";
  const ano = String(year).slice(-2);
  return `${isFinal ? "Etapa Final" : `Etapa ${number}`} - ${mes}/${ano}`;
}

/** Versão curta para colunas de tabela: "Jul/26". */
export function stageShortLabel(isoDate: string): string {
  const { year, month } = parseDateParts(isoDate);
  return `${MESES[month - 1] ?? "???"}/${String(year).slice(-2)}`;
}

/** "29 de janeiro de 2026" */
export function formatLongDate(isoDate: string): string {
  const { year, month, day } = parseDateParts(isoDate);
  return `${day} de ${MESES_LONGOS[month - 1]} de ${year}`;
}

/** "29/01/2026" */
export function formatShortDate(isoDate: string): string {
  const { year, month, day } = parseDateParts(isoDate);
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
}
