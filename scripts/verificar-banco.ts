/**
 * Conferência ponta a ponta: lê o que está NO BANCO, pelo mesmo código que o
 * app usa em produção, e compara com a planilha original.
 *
 *   npm run verificar:banco
 *
 * Diferente de `verificar.ts`, que só exercita planilha -> ranking, este script
 * exercita planilha -> seed -> Supabase -> queries do app -> ranking. É o que
 * prova que o dado sobreviveu à ida e volta pelo banco.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Precisa vir antes de importar as queries: o cliente Supabase lê as variáveis
// de ambiente na primeira chamada.
loadEnv({ path: path.join(ROOT, ".env.local") });
loadEnv({ path: path.join(ROOT, ".env") });

import { getCurrentSeason, getSeasonBundle } from "../lib/db/queries";
import { parse2026Workbook } from "../lib/import/parse-2026";
import { formatBRL } from "../lib/domain/money";
import { stageName } from "../lib/domain/stage-name";

let falhas = 0;

function conferir(rotulo: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas += 1;
  console.log(
    `${ok ? "✓" : "✖"} ${rotulo.padEnd(40)} ${String(obtido).padStart(14)}` +
      (ok ? "" : `   esperado: ${String(esperado)}`),
  );
}

async function main() {
  const planilha = parse2026Workbook(path.join(ROOT, "data", "2026.xlsx"));

  const season = await getCurrentSeason();
  if (!season) {
    console.error("✖ Nenhuma temporada no banco. Rode: npm run seed");
    process.exit(1);
  }

  const bundle = await getSeasonBundle(season);

  console.log(`\n═══ TEMPORADA NO BANCO: ${season.name} ═══════════════════\n`);

  conferir("Jogadores cadastrados", bundle.players.length, planilha.players.length);
  conferir("Etapas", bundle.stages.length, planilha.stages.length);
  conferir("Participações", bundle.totals.participations, planilha.results.length);
  conferir("Reserva acumulada da Final", bundle.accumulatedReserve, 5210);
  conferir(
    "Arrecadação total",
    bundle.totals.gross,
    planilha.stages.reduce((soma, etapa) => soma + (etapa.grossAmount ?? 0), 0),
  );

  console.log("\n═══ ETAPAS ═══════════════════════════════════════════════\n");

  for (const stage of bundle.stages) {
    const naPlanilha = planilha.stages.find((s) => s.number === stage.number);
    const esperado = naPlanilha?.grossAmount ?? 0;
    const ok = stage.gross === esperado;
    if (!ok) falhas += 1;

    console.log(
      `${ok ? "✓" : "✖"} ${stageName(stage.number, stage.eventDate, stage.isFinal).padEnd(20)}` +
        `${String(stage.participantCount).padStart(3)} jogadores` +
        `${formatBRL(stage.gross).padStart(14)}` +
        `${formatBRL(stage.reserve).padStart(12)} de reserva` +
        `${stage.status === "scheduled" ? "   (agendada)" : ""}`,
    );
  }

  console.log("\n═══ RANKING (top 10 do banco vs. planilha) ═══════════════\n");

  for (const row of bundle.ranking.slice(0, 10)) {
    const esperado = planilha.spreadsheetTotals.get(row.player.fullName);
    const ok = row.totalPoints === esperado;
    if (!ok) falhas += 1;
    console.log(
      `${ok ? "✓" : "✖"} ${String(row.position).padStart(2)}º ${row.player.fullName.padEnd(24)}` +
        `${String(row.totalPoints).padStart(4)} pts` +
        `${String(row.stagesPlayed).padStart(3)} etapas` +
        `   médias ${row.averagePoints.toFixed(1)} pts / ${row.averagePlacement?.toFixed(1) ?? "—"}º`,
    );
  }

  // Confere TODOS os jogadores, não só o top 10.
  const divergentes = bundle.ranking.filter(
    (row) => row.totalPoints !== (planilha.spreadsheetTotals.get(row.player.fullName) ?? 0),
  ).length;

  console.log("");
  conferir("Jogadores com pontuação divergente", divergentes, 0);

  const aRevisar = bundle.stages.reduce((soma, etapa) => soma + etapa.needsReviewCount, 0);
  console.log(`\nParticipações marcadas para revisão: ${aRevisar}`);

  console.log("");
  if (falhas > 0) {
    console.log(`✖ ${falhas} verificações falharam.\n`);
    process.exit(1);
  }
  console.log("✓ O banco reproduz a planilha exatamente.\n");
}

main().catch((error) => {
  console.error("\n✖ Erro:", error instanceof Error ? error.message : error);
  process.exit(1);
});
