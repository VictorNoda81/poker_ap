/**
 * Dinheiro.
 *
 * Todo cálculo de premiação passa por centavos inteiros. Trabalhar direto com
 * float em reais faz a soma dos prêmios fechar em 8099,999999999 e o aviso de
 * "não bate com a arrecadação" disparar sem motivo.
 */

/** Reais -> centavos (inteiro). */
export function toCents(value: number): number {
  return Math.round(value * 100);
}

/** Centavos -> reais. */
export function fromCents(cents: number): number {
  return cents / 100;
}

/** Arredonda para 2 casas passando por centavos. */
export function round2(value: number): number {
  return fromCents(toCents(value));
}

const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Formata em Real brasileiro: 1234.56 -> "R$ 1.234,56". */
export function formatBRL(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  // O Intl usa espaço não separável entre "R$" e o número; trocamos por um
  // espaço comum para não quebrar buscas e comparações de texto nos testes.
  return BRL.format(value).replace(/ /g, " ");
}

/** Igual a formatBRL, mas com sinal explícito — usado na coluna de saldo. */
export function formatBRLSigned(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const formatted = formatBRL(Math.abs(value));
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `−${formatted}`;
  return formatted;
}

/**
 * Lê um valor digitado pelo admin e devolve número.
 *
 * Aceita as duas convenções sem perguntar nada: "1.234,56" (brasileira) e
 * "1234.56". Devolve null para campo vazio ou texto que não é número — o que
 * o chamador interpreta como "ainda não informado", diferente de zero.
 */
export function parseMoney(input: string): number | null {
  const raw = input.replace(/[R$\s]/gi, "").trim();
  if (raw === "") return null;

  // Se tem vírgula, ela é o separador decimal e os pontos são de milhar.
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Formata número com separador de milhar brasileiro: 1234 -> "1.234". */
export function formatNumber(value: number, fractionDigits = 0): string {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}
