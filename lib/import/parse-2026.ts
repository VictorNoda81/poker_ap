/**
 * Compatibilidade: a leitura das planilhas virou genérica em `parse-ranking.ts`
 * (o layout é o mesmo em toda temporada). Este arquivo mantém os nomes antigos
 * para não quebrar imports existentes.
 */

export {
  excelSerialToISO,
  normalizePlayerName,
  parseRankingWorkbook,
  playerKey,
  type ParsedRanking,
  type ParsedResult,
  type ParsedStage,
} from "./parse-ranking";

import { parseRankingWorkbook, type ParsedRanking } from "./parse-ranking";

/** @deprecated Use `parseRankingWorkbook`. */
export const parse2026Workbook = parseRankingWorkbook;

/** @deprecated Use `ParsedRanking`. */
export type Parsed2026 = ParsedRanking;
