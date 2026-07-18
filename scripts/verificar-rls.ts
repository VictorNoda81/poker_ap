/**
 * Prova que as políticas de segurança (RLS) fazem o que prometem.
 *
 *   npm run verificar:rls
 *
 * A chave `anon` vai para o navegador de qualquer visitante — ela é pública por
 * natureza. O que impede alguém de reescrever o ranking com ela é o RLS. Este
 * script tenta, de fato, escrever com a chave anon e falha se conseguir.
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

/** Uma linha mínima e plausível para cada tabela, só para provocar o INSERT. */
const AMOSTRAS: Record<string, Record<string, unknown>> = {
  seasons: { year: 1900, name: "invasao" },
  players: { full_name: "Invasor RLS", type: "indefinido" },
  stages: { season_id: "00000000-0000-0000-0000-000000000000", number: 99, event_date: "1900-01-01" },
  stage_entries: {
    stage_id: "00000000-0000-0000-0000-000000000000",
    player_id: "00000000-0000-0000-0000-000000000000",
    points: 999,
  },
  season_settings: { season_id: "00000000-0000-0000-0000-000000000000" },
  points_table: { season_id: "00000000-0000-0000-0000-000000000000", placement: 1, points: 999 },
  final_invitees: {
    stage_id: "00000000-0000-0000-0000-000000000000",
    player_id: "00000000-0000-0000-0000-000000000000",
  },
};

async function main() {
  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  let falhas = 0;

  console.log("\n═══ LEITURA com a chave anon (deve FUNCIONAR) ════════════\n");
  for (const tabela of TABELAS) {
    const { error } = await anon.from(tabela).select("*").limit(1);
    const ok = !error;
    if (!ok) falhas += 1;
    console.log(`${ok ? "✓" : "✖"} ${tabela.padEnd(18)} ${error?.message ?? "leitura liberada"}`);
  }

  console.log("\n═══ ESCRITA com a chave anon (deve ser BLOQUEADA) ════════\n");
  for (const tabela of TABELAS) {
    const { error } = await anon.from(tabela).insert(AMOSTRAS[tabela]);
    // Sem erro = o insert passou = falha grave de segurança.
    const bloqueado = Boolean(error);
    if (!bloqueado) {
      falhas += 1;
      console.log(`✖ ${tabela.padEnd(18)} INSERT PASSOU — falha de segurança!`);
      // Desfaz o estrago do teste, se por acaso tiver entrado.
      await anon.from(tabela).delete().match(AMOSTRAS[tabela]);
    } else {
      console.log(`✓ ${tabela.padEnd(18)} bloqueado (${error!.code})`);
    }
  }

  console.log("\n═══ DELETE com a chave anon (deve ser BLOQUEADO) ═════════\n");
  const { error: deleteError, count } = await anon
    .from("players")
    .delete({ count: "exact" })
    .eq("type", "indefinido");
  // RLS sem política de DELETE não gera erro: simplesmente não apaga nada.
  const seguro = Boolean(deleteError) || count === 0;
  if (!seguro) falhas += 1;
  console.log(
    seguro
      ? `✓ players            nada apagado (${deleteError ? deleteError.code : "0 linhas"})`
      : `✖ players            APAGOU ${count} linhas — falha de segurança!`,
  );

  console.log("");
  if (falhas > 0) {
    console.log(`✖ ${falhas} verificações falharam.\n`);
    process.exit(1);
  }
  console.log("✓ A chave pública lê tudo e não escreve nada.\n");
}

main().catch((error) => {
  console.error("\n✖ Erro:", error instanceof Error ? error.message : error);
  process.exit(1);
});
