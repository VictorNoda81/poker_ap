/**
 * Diagnóstico da conexão com o Supabase.
 *
 *   npm run checar
 *
 * Diz se as variáveis de ambiente estão presentes, se o projeto responde e
 * quais tabelas já existem. Útil antes de rodar o seed, para saber se as
 * migrations foram aplicadas.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnv({ path: path.join(ROOT, ".env.local") });
loadEnv({ path: path.join(ROOT, ".env") });

const TABELAS = [
  "seasons",
  "players",
  "stages",
  "stage_entries",
  "season_settings",
  "points_table",
  "final_invitees",
];

async function main() {
  console.log("\n═══ VARIÁVEIS DE AMBIENTE ════════════════════════════════\n");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const senha = process.env.ADMIN_PASSWORD;
  const segredo = process.env.SESSION_SECRET;

  const marca = (valor?: string) => (valor ? "definida" : "AUSENTE");
  console.log(`NEXT_PUBLIC_SUPABASE_URL ....... ${url ?? "AUSENTE"}`);
  console.log(`NEXT_PUBLIC_SUPABASE_ANON_KEY .. ${marca(anon)}`);
  console.log(`SUPABASE_SERVICE_ROLE_KEY ...... ${marca(service)}`);
  console.log(`ADMIN_PASSWORD ................. ${marca(senha)}`);
  console.log(`SESSION_SECRET ................. ${marca(segredo)}`);

  if (url?.includes("/rest/v1")) {
    console.log(
      "\n⚠ A URL contém /rest/v1. Use apenas a URL base do projeto\n" +
        "  (https://xxxx.supabase.co) — o cliente monta o caminho sozinho.",
    );
  }

  if (!url || !service) {
    console.log("\n✖ Sem URL ou service_role não dá para checar as tabelas.\n");
    process.exit(1);
  }

  console.log("\n═══ TABELAS ══════════════════════════════════════════════\n");

  const db = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let faltando = 0;
  for (const tabela of TABELAS) {
    // Um SELECT de verdade, não `head: true`: numa requisição HEAD o PostgREST
    // não devolve corpo, então o erro de "tabela não existe" vem sem mensagem e
    // o cliente reporta sucesso com 0 linhas — um falso positivo.
    const { count, error } = await db.from(tabela).select("*", { count: "exact" }).limit(1);
    if (error) {
      faltando += 1;
      console.log(`${tabela.padEnd(18)} ✖ ${error.message}`);
    } else {
      console.log(`${tabela.padEnd(18)} ✓ ${count ?? 0} linhas`);
    }
  }

  console.log("");
  if (faltando === TABELAS.length) {
    console.log(
      "As tabelas não existem ainda. Rode as migrations no SQL Editor do Supabase:\n" +
        "  1. supabase/migrations/0001_schema.sql\n" +
        "  2. supabase/migrations/0002_rls.sql\n",
    );
    process.exit(1);
  }
  if (faltando > 0) {
    console.log(`⚠ ${faltando} tabelas faltando — reveja as migrations.\n`);
    process.exit(1);
  }
  console.log("Tudo certo. Se as tabelas estiverem vazias, rode: npm run seed\n");
}

main().catch((error) => {
  console.error("\n✖ Erro:", error instanceof Error ? error.message : error);
  process.exit(1);
});
