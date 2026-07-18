/**
 * Conferência numérica da importação, sem depender do banco.
 *
 *   npx tsx scripts/verificar.ts
 *
 * Roda o mesmo caminho que o app usa em produção (planilha -> parser ->
 * ranking) e imprime o resultado lado a lado com os totais da planilha, para
 * conferência a olho. Os testes automatizados cobrem o mesmo terreno; este
 * script existe para inspeção manual.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildRanking, type RankingEntry, type RankingPlayer } from "../lib/domain/ranking";
import { computeReserve, suggestStagePrizes } from "../lib/domain/prizes";
import { formatBRL } from "../lib/domain/money";
import { stageName } from "../lib/domain/stage-name";
import { parse2026Workbook } from "../lib/import/parse-2026";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const parsed = parse2026Workbook(path.join(ROOT, "data", "2026.xlsx"));

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

console.log("\n═══ ETAPAS ═══════════════════════════════════════════════════\n");
for (const stage of parsed.stages) {
  const nome = stageName(stage.number, stage.date);
  const participantes = parsed.results.filter((r) => r.stageNumber === stage.number).length;

  if (stage.grossAmount === null) {
    console.log(`${nome.padEnd(20)} agendada`);
    continue;
  }

  const reserva = computeReserve(stage.grossAmount, 10);
  const premios = suggestStagePrizes(stage.grossAmount);
  const confere = reserva === stage.reserveAmount ? "ok" : "DIVERGE";

  console.log(
    `${nome.padEnd(20)} ${String(participantes).padStart(2)} jogadores  ` +
      `arrecadou ${formatBRL(stage.grossAmount).padStart(12)}  ` +
      `reserva ${formatBRL(reserva).padStart(10)} (${confere})  ` +
      `1º ${formatBRL(premios.byPlacement[0].amount)}`,
  );
}

const reservaTotal = parsed.stages.reduce((sum, s) => sum + (s.reserveAmount ?? 0), 0);
console.log(`\nReserva acumulada da temporada: ${formatBRL(reservaTotal)}`);
console.log("Planilha diz: R$ 5.210,00");

console.log("\n═══ RANKING (top 20) ═════════════════════════════════════════\n");
console.log("  #  JOGADOR                     PTS  ETAPAS  MÉD.PTS  CLASS.MÉD  PLANILHA");

let divergencias = 0;
for (const row of ranking.slice(0, 20)) {
  const naPlanilha = parsed.spreadsheetTotals.get(row.player.fullName) ?? 0;
  const bate = naPlanilha === row.totalPoints;
  if (!bate) divergencias += 1;

  console.log(
    `${String(row.position).padStart(3)}  ` +
      `${row.player.fullName.padEnd(26)}` +
      `${String(row.totalPoints).padStart(4)}` +
      `${String(row.stagesPlayed).padStart(8)}` +
      `${row.averagePoints.toFixed(1).padStart(9)}` +
      `${(row.averagePlacement?.toFixed(1) ?? "—").padStart(11)}` +
      `${String(naPlanilha).padStart(10)}${bate ? "" : "  <-- DIVERGE"}`,
  );
}

// Confere TODOS, não só o top 20.
for (const row of ranking) {
  if ((parsed.spreadsheetTotals.get(row.player.fullName) ?? 0) !== row.totalPoints) {
    divergencias += 1;
  }
}

console.log("\n═══ RESUMO ═══════════════════════════════════════════════════\n");
console.log(`Jogadores ............ ${parsed.players.length}`);
console.log(`Etapas ............... ${parsed.stages.length}`);
console.log(`Participações ........ ${parsed.results.length}`);
console.log(`A revisar ............ ${parsed.results.filter((r) => r.needsReview).length}`);
console.log(`Divergências de pontos: ${divergencias === 0 ? "nenhuma" : divergencias}`);

if (divergencias > 0) process.exit(1);
