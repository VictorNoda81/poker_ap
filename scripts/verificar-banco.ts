/**
 * Conferência ponta a ponta: lê o que está NO BANCO, pelo mesmo código que o
 * app usa em produção, e compara com as planilhas originais — todas as
 * temporadas.
 *
 *   npm run verificar:banco
 *
 * Exercita planilha -> seed -> Supabase -> queries do app -> ranking. É o que
 * prova que o dado sobreviveu à ida e volta pelo banco.
 *
 * A comparação de jogador é por `playerKey` (acento-insensível), porque o nome
 * exibido no banco pode diferir da grafia de uma planilha específica.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnv({ path: path.join(ROOT, ".env.local") });
loadEnv({ path: path.join(ROOT, ".env") });

import { getSeasonByYear, getSeasonBundle } from "../lib/db/queries";
import { parseRankingWorkbook, playerKey } from "../lib/import/parse-ranking";

const SEASONS = [2023, 2024, 2025, 2026];

let falhas = 0;
function conferir(rotulo: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas += 1;
  console.log(
    `  ${ok ? "✓" : "✖"} ${rotulo.padEnd(34)} ${String(obtido).padStart(10)}` +
      (ok ? "" : `   esperado: ${String(esperado)}`),
  );
}

async function main() {
  for (const year of SEASONS) {
    const planilha = parseRankingWorkbook(path.join(ROOT, "data", `${year}.xlsx`));
    const season = await getSeasonByYear(year);

    console.log(`\n═══ TEMPORADA ${year} ${"═".repeat(40)}\n`);
    if (!season) {
      falhas += 1;
      console.log(`  ✖ não encontrada no banco. Rode: npm run seed`);
      continue;
    }

    const bundle = await getSeasonBundle(season);

    conferir("Etapas", bundle.stages.length, planilha.stages.length);
    conferir("Participações", bundle.totals.participations, planilha.results.length);
    conferir(
      "Reserva acumulada",
      bundle.accumulatedReserve,
      planilha.stages.reduce((s, e) => s + (e.reserveAmount ?? 0), 0),
    );
    conferir(
      "Arrecadação total",
      bundle.totals.gross,
      planilha.stages.reduce((s, e) => s + (e.grossAmount ?? 0), 0),
    );

    // Pontos por jogador: compara o banco com a planilha, casando por chave.
    const planilhaPorChave = new Map<string, number>();
    for (const [nome, pts] of planilha.spreadsheetTotals) {
      planilhaPorChave.set(playerKey(nome), pts);
    }
    let divergentes = 0;
    for (const row of bundle.ranking) {
      if (row.stagesPlayed === 0) continue;
      const esperado = planilhaPorChave.get(playerKey(row.player.fullName));
      if (esperado !== row.totalPoints) divergentes += 1;
    }
    conferir("Jogadores com pontos divergentes", divergentes, 0);

    const lider = bundle.ranking.find((r) => r.stagesPlayed > 0);
    console.log(
      `  líder: ${lider?.player.fullName} (${lider?.totalPoints} pts) · ` +
        `${bundle.ranking.filter((r) => r.stagesPlayed > 0).length} jogadores ativos`,
    );
  }

  console.log(`\n${"═".repeat(56)}`);
  if (falhas > 0) {
    console.log(`✖ ${falhas} verificações falharam.\n`);
    process.exit(1);
  }
  console.log("✓ O banco reproduz todas as planilhas exatamente.\n");
}

main().catch((error) => {
  console.error("\n✖ Erro:", error instanceof Error ? error.message : error);
  process.exit(1);
});
