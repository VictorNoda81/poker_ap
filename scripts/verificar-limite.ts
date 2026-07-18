/**
 * Teste de fumaça do limite de tentativas, contra o banco de verdade.
 *
 *   npx tsx scripts/verificar-limite.ts
 *
 * Grava tentativas falhas numa origem fictícia, confere que a terceira
 * bloqueia, que um acerto destrava, e limpa tudo no final. Não toca no
 * histórico real de ninguém: usa um ip_hash próprio de teste.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { JANELA_MINUTOS, avaliarLimite, type TentativaLogin } from "../lib/domain/rate-limit";
import { normalizeSupabaseUrl } from "../lib/supabase/url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnv({ path: path.join(ROOT, ".env.local") });

const IP_TESTE = "teste-automatizado-limite-login";

async function main() {
  const db = createClient(
    normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL!),
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  // Estado limpo antes de começar.
  await db.from("admin_login_attempts").delete().eq("ip_hash", IP_TESTE);

  async function estadoAtual() {
    const desde = new Date(Date.now() - JANELA_MINUTOS * 60_000).toISOString();
    const { data, error } = await db
      .from("admin_login_attempts")
      .select("succeeded, created_at")
      .eq("ip_hash", IP_TESTE)
      .gte("created_at", desde)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const tentativas: TentativaLogin[] = (data ?? []).map((l) => ({
      at: new Date(l.created_at as string),
      succeeded: Boolean(l.succeeded),
    }));
    return avaliarLimite(tentativas);
  }

  async function registrar(succeeded: boolean) {
    const { error } = await db
      .from("admin_login_attempts")
      .insert({ ip_hash: IP_TESTE, succeeded });
    if (error) throw new Error(error.message);
  }

  let falhas = 0;
  function conferir(rotulo: string, obtido: unknown, esperado: unknown) {
    const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
    if (!ok) falhas += 1;
    console.log(
      `${ok ? "✓" : "✖"} ${rotulo.padEnd(46)} ${String(obtido)}` +
        (ok ? "" : `   esperado: ${String(esperado)}`),
    );
  }

  console.log("\n═══ LIMITE DE TENTATIVAS (contra o banco real) ═══════════\n");

  conferir("Início: tentativas restantes", (await estadoAtual()).restantes, 3);

  await registrar(false);
  conferir("Após 1 erro: restantes", (await estadoAtual()).restantes, 2);

  await registrar(false);
  const doisErros = await estadoAtual();
  conferir("Após 2 erros: restantes", doisErros.restantes, 1);
  conferir("Após 2 erros: bloqueado?", doisErros.bloqueado, false);

  await registrar(false);
  const tresErros = await estadoAtual();
  conferir("Após 3 erros: bloqueado?", tresErros.bloqueado, true);
  conferir("Após 3 erros: restantes", tresErros.restantes, 0);
  console.log(
    `  libera em ${Math.round(tresErros.liberaEmSegundos / 60)} minutos ` +
      `(${tresErros.liberaEmSegundos}s)`,
  );

  // Um acerto zera o histórico.
  await registrar(true);
  const depoisDoAcerto = await estadoAtual();
  conferir("Após acertar: bloqueado?", depoisDoAcerto.bloqueado, false);
  conferir("Após acertar: restantes", depoisDoAcerto.restantes, 3);

  // Limpeza.
  await db.from("admin_login_attempts").delete().eq("ip_hash", IP_TESTE);
  const { count } = await db
    .from("admin_login_attempts")
    .select("*", { count: "exact" })
    .eq("ip_hash", IP_TESTE);
  conferir("Limpeza: registros de teste removidos", count, 0);

  console.log("");
  if (falhas > 0) {
    console.log(`✖ ${falhas} verificações falharam.\n`);
    process.exit(1);
  }
  console.log("✓ O limite funciona contra o banco real.\n");
}

main().catch((error) => {
  console.error("\n✖ Erro:", error instanceof Error ? error.message : error);
  process.exit(1);
});
