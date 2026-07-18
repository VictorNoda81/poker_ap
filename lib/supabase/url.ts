/**
 * Normalização da URL do Supabase.
 *
 * O painel do Supabase exibe a URL do projeto já com o sufixo `/rest/v1/`
 * (é o endereço da API REST, não do projeto). Quem copia de lá e cola na
 * variável de ambiente acaba com o cliente montando
 * `.../rest/v1//rest/v1/seasons`, e toda consulta falha com
 * "Invalid path specified in request URL" — um erro que não diz nada sobre
 * a causa real.
 *
 * Em vez de exigir que quem faz o deploy lembre de cortar o sufixo, cortamos
 * aqui. É a diferença entre um site fora do ar e um site que funciona.
 */

/** Sufixos que o painel do Supabase costuma incluir e que o cliente não quer. */
const SUFIXOS = ["/rest/v1", "/auth/v1", "/storage/v1", "/realtime/v1", "/functions/v1"];

export function normalizeSupabaseUrl(raw: string): string {
  let url = raw.trim();

  // Barras finais atrapalham a comparação dos sufixos abaixo.
  url = url.replace(/\/+$/, "");

  for (const sufixo of SUFIXOS) {
    if (url.toLowerCase().endsWith(sufixo)) {
      url = url.slice(0, -sufixo.length);
      break;
    }
  }

  return url.replace(/\/+$/, "");
}
