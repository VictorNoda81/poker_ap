/**
 * Conferência numérica das planilhas, sem depender do banco.
 *
 *   npm run verificar
 *
 * Roda o mesmo caminho que o app usa (planilha -> ranking) para cada temporada
 * e imprime o resultado lado a lado com os totais da planilha.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildRanking, type RankingEntry, type RankingPlayer } from "../lib/domain/ranking";
import { computeReserve } from "../lib/domain/prizes";
import { formatBRL } from "../lib/domain/money";
import { parseRankingWorkbook } from "../lib/import/parse-ranking";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SEASONS = [2023, 2024, 2025, 2026];

let divergencias = 0;

for (const year of SEASONS) {
  const parsed = parseRankingWorkbook(path.join(ROOT, "data", `${year}.xlsx`));

  const players: RankingPlayer[] = parsed.players.map((name) => ({
    id: name,
    fullName: name,
    type: "indefinido",
    memberNumber: null,
    invitedByName: null,
  }));
  const entries: RankingEntry[] = parsed.results.map((r) => ({
    stageId: `etapa-${r.stageNumber}`,
    playerId: r.playerName,
    placement: r.placement,
    points: r.points,
    amountPaid: null,
    prizeAmount: 0,
  }));
  const ranking = buildRanking(players, entries);

  const reservaPlanilha = parsed.stages.reduce((s, e) => s + (e.reserveAmount ?? 0), 0);
  const reservaCalc = parsed.stages.reduce(
    (s, e) => s + (e.grossAmount !== null ? computeReserve(e.grossAmount, 10) : 0),
    0,
  );
  const totalPlanilha = [...parsed.spreadsheetTotals.values()].reduce((a, b) => a + b, 0);
  const totalRanking = ranking.reduce((s, r) => s + r.totalPoints, 0);

  const divergentes = ranking.filter(
    (r) => r.totalPoints !== (parsed.spreadsheetTotals.get(r.player.fullName) ?? 0),
  ).length;
  divergencias += divergentes;

  const lider = ranking.find((r) => r.stagesPlayed > 0);
  const revisar = parsed.results.filter((r) => r.needsReview).length;

  console.log(`\n═══ ${year} ${"═".repeat(46)}`);
  console.log(
    `  ${parsed.players.length} jogadores · ${parsed.stages.length} etapas · ` +
      `${parsed.results.length} participações`,
  );
  console.log(`  líder: ${lider?.player.fullName} (${lider?.totalPoints} pts)`);
  console.log(
    `  reserva: ${formatBRL(reservaPlanilha)} (planilha) vs ${formatBRL(reservaCalc)} (calculada)` +
      (reservaPlanilha === reservaCalc ? "  ✓" : "  ✖ DIVERGE"),
  );
  console.log(
    `  soma de pontos: ${totalRanking} (ranking) vs ${totalPlanilha} (planilha)` +
      (totalRanking === totalPlanilha ? "  ✓" : "  ✖ DIVERGE"),
  );
  console.log(
    `  jogadores com pontos divergentes: ${divergentes === 0 ? "nenhum ✓" : divergentes + " ✖"}` +
      (revisar > 0 ? `   ·   ${revisar} a revisar` : ""),
  );
}

console.log(`\n${"═".repeat(52)}`);
console.log(divergencias === 0 ? "✓ Todas as temporadas conferem.\n" : `✖ ${divergencias} divergências.\n`);
if (divergencias > 0) process.exit(1);
