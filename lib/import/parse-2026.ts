/**
 * Leitura da planilha `data/2026.xlsx` — a fonte de verdade da temporada 2026
 * antes deste app existir.
 *
 * Estrutura da planilha (aba "2026"):
 *   linha 2   -> C..K contêm a DATA de cada etapa (número de série do Excel)
 *   linha 3   -> rótulos "PONTOS"
 *   linha 4+  -> A = posição, B = nome do jogador, C..K = pontos por etapa
 *   linha 64  -> "10% DO POTE POR RODADA": a reserva da Final de cada etapa
 *
 * Limitações conhecidas da planilha, e como lidamos com elas:
 *   - Ela guarda PONTOS, não colocação. Invertemos usando a tabela de
 *     pontuação (55 -> 1º, 48 -> 2º, ...). Como cada colocação de 1º a 15º
 *     vale um número distinto, a inversão é exata nessa faixa.
 *   - 5 pontos = "16º ou pior", sem posição exata. Vira placement NULL.
 *   - 0 pontos (ou célula vazia) = não participou. Não vira participação.
 *   - Há colocações DUPLICADAS numa mesma etapa (dois jogadores com 28 pontos
 *     em Jan/26, por exemplo). São erros de digitação da planilha original:
 *     importamos os dois e marcamos `needsReview` para o admin corrigir.
 *   - Não há valor gasto nem prêmio por jogador. Só o total do pote por etapa,
 *     deduzido da linha dos 10% (gross = valor × 10).
 */

import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import {
  DEFAULT_POINTS_BELOW_CUTOFF,
  DEFAULT_POINTS_TABLE,
  placementFromPoints,
  type PointsTable,
} from "../domain/scoring";

const SHEET_SEASON = "2026";
const SHEET_POINTS = "Plan2";

const HEADER_DATE_ROW = 2;
const FIRST_PLAYER_ROW = 4;
const FIRST_STAGE_COL = "C";
const LAST_STAGE_COL = "K";
const POT_ROW_LABEL = "10% DO POTE POR RODADA";

export interface ParsedStage {
  /** Número da etapa dentro da temporada (1, 2, 3...). */
  number: number;
  /** Data no formato ISO "2026-01-29". */
  date: string;
  /** Arrecadação total (= 10 × a reserva registrada). null quando não houve. */
  grossAmount: number | null;
  /** Reserva de 10% conforme a planilha. null quando a etapa ainda não ocorreu. */
  reserveAmount: number | null;
  /** Coluna da planilha, só para mensagens de erro. */
  column: string;
}

export interface ParsedResult {
  playerName: string;
  stageNumber: number;
  points: number;
  /** Colocação derivada dos pontos. null = 16º ou pior. */
  placement: number | null;
  needsReview: boolean;
  reviewNote: string | null;
}

export interface Parsed2026 {
  pointsTable: PointsTable;
  pointsBelowCutoff: number;
  /** Nomes já normalizados, na ordem em que aparecem na planilha. */
  players: string[];
  stages: ParsedStage[];
  results: ParsedResult[];
  /** Ranking final da planilha (nome -> total de pontos), para conferência. */
  spreadsheetTotals: Map<string, number>;
}

/** Número de série do Excel -> data ISO. A época do Excel é 30/12/1899. */
export function excelSerialToISO(serial: number): string {
  const epoch = Date.UTC(1899, 11, 30);
  const date = new Date(epoch + serial * 86_400_000);
  return date.toISOString().slice(0, 10);
}

/**
 * Normaliza o nome: tira espaços sobrando e converte de CAIXA ALTA para
 * Capitalização de Nome Próprio, mantendo acentos e minúsculas em conectivos.
 * "RODOLFO NEGRÃO  " -> "Rodolfo Negrão";  "PEDRO LINS (PEU)" -> "Pedro Lins (Peu)"
 */
export function normalizePlayerName(raw: string): string {
  const cleaned = raw.replace(/\s+/g, " ").trim();
  const particles = new Set(["de", "da", "do", "das", "dos", "e"]);

  return cleaned
    .toLocaleLowerCase("pt-BR")
    .split(" ")
    .map((word, index) => {
      if (index > 0 && particles.has(word)) return word;
      // Capitaliza também depois de "(" — para apelidos entre parênteses.
      return word.replace(/(^|\()(\p{L})/gu, (_, prefix: string, letter: string) =>
        prefix + letter.toLocaleUpperCase("pt-BR"),
      );
    })
    .join(" ");
}

function columnRange(from: string, to: string): string[] {
  const cols: string[] = [];
  for (let code = from.charCodeAt(0); code <= to.charCodeAt(0); code += 1) {
    cols.push(String.fromCharCode(code));
  }
  return cols;
}

function cellValue(sheet: XLSX.WorkSheet, address: string): XLSX.CellObject | undefined {
  return sheet[address] as XLSX.CellObject | undefined;
}

function numberAt(sheet: XLSX.WorkSheet, address: string): number | null {
  const cell = cellValue(sheet, address);
  if (!cell || cell.v === undefined || cell.v === null || cell.v === "") return null;
  const value = typeof cell.v === "number" ? cell.v : Number(String(cell.v).replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

function textAt(sheet: XLSX.WorkSheet, address: string): string | null {
  const cell = cellValue(sheet, address);
  if (!cell || cell.v === undefined || cell.v === null) return null;
  const text = String(cell.v).trim();
  return text === "" ? null : text;
}

/** Lê a aba "Plan2" e monta a tabela de pontuação (1º a 15º) + faixa 16º ou pior. */
function parsePointsTable(workbook: XLSX.WorkBook): {
  table: PointsTable;
  belowCutoff: number;
} {
  const sheet = workbook.Sheets[SHEET_POINTS];
  if (!sheet) {
    return { table: { ...DEFAULT_POINTS_TABLE }, belowCutoff: DEFAULT_POINTS_BELOW_CUTOFF };
  }

  const table: PointsTable = {};
  let belowCutoff = DEFAULT_POINTS_BELOW_CUTOFF;

  // As linhas vão de 2 a 17: colocações 1 a 16 (a 16ª é a faixa "ou pior").
  for (let row = 2; row <= 60; row += 1) {
    const placement = numberAt(sheet, `A${row}`);
    const label = textAt(sheet, `B${row}`);
    if (placement === null || label === null) continue;

    const points = Number(label.replace(/[^\d]/g, ""));
    if (!Number.isFinite(points)) continue;

    if (placement >= 16) belowCutoff = points;
    else table[placement] = points;
  }

  return { table, belowCutoff };
}

export function parse2026Workbook(fileOrBuffer: string | Buffer): Parsed2026 {
  // Lemos o arquivo aqui em vez de usar XLSX.readFile: a build ESM do xlsx não
  // enxerga o `fs` do Node sem configuração extra.
  const buffer = typeof fileOrBuffer === "string" ? readFileSync(fileOrBuffer) : fileOrBuffer;
  const workbook = XLSX.read(buffer, { type: "buffer" });

  const sheet = workbook.Sheets[SHEET_SEASON];
  if (!sheet) throw new Error(`Aba "${SHEET_SEASON}" não encontrada na planilha.`);

  const { table: pointsTable, belowCutoff: pointsBelowCutoff } = parsePointsTable(workbook);

  // --- Etapas: as datas ficam na linha 2, colunas C em diante. -------------
  const stages: ParsedStage[] = [];
  for (const column of columnRange(FIRST_STAGE_COL, LAST_STAGE_COL)) {
    const serial = numberAt(sheet, `${column}${HEADER_DATE_ROW}`);
    if (serial === null) continue;
    stages.push({
      number: stages.length + 1,
      date: excelSerialToISO(serial),
      grossAmount: null,
      reserveAmount: null,
      column,
    });
  }
  if (stages.length === 0) throw new Error("Nenhuma etapa encontrada na linha de datas.");

  // --- Linha dos 10%: localizada pelo rótulo, não por número fixo. ---------
  let potRow: number | null = null;
  for (let row = FIRST_PLAYER_ROW; row <= 200; row += 1) {
    const label = textAt(sheet, `B${row}`);
    if (label && label.toUpperCase().includes("10%")) {
      potRow = row;
      break;
    }
  }
  if (potRow !== null) {
    for (const stage of stages) {
      const reserve = numberAt(sheet, `${stage.column}${potRow}`);
      if (reserve === null || reserve === 0) continue;
      stage.reserveAmount = reserve;
      // A planilha guarda os 10%; a arrecadação da etapa é 10× esse valor.
      stage.grossAmount = reserve * 10;
    }
  }

  // --- Jogadores e resultados ---------------------------------------------
  const players: string[] = [];
  const results: ParsedResult[] = [];
  const spreadsheetTotals = new Map<string, number>();
  const seen = new Set<string>();

  // Por etapa, guarda quais colocações já foram usadas — para detectar as
  // duplicatas que existem na planilha original.
  const placementsUsed = new Map<number, Map<number, string>>();

  const lastRow = potRow ?? 200;
  for (let row = FIRST_PLAYER_ROW; row < lastRow; row += 1) {
    const rawName = textAt(sheet, `B${row}`);
    if (!rawName) continue;

    const name = normalizePlayerName(rawName);
    const key = name.toLowerCase();
    if (seen.has(key)) {
      throw new Error(`Nome duplicado na planilha (linha ${row}): "${rawName}".`);
    }
    seen.add(key);
    players.push(name);

    let total = 0;
    for (const stage of stages) {
      const points = numberAt(sheet, `${stage.column}${row}`);
      // Vazio ou zero = não participou desta etapa.
      if (points === null || points === 0) continue;

      total += points;

      const { placement, unknown } = placementFromPoints(points, pointsTable, pointsBelowCutoff);

      let needsReview = false;
      let reviewNote: string | null = null;

      if (unknown) {
        needsReview = true;
        reviewNote = `Pontuação ${points} não corresponde a nenhuma colocação da tabela.`;
      } else if (placement !== null) {
        const used = placementsUsed.get(stage.number) ?? new Map<number, string>();
        const other = used.get(placement);
        if (other) {
          needsReview = true;
          reviewNote = `Colocação ${placement}º aparece duplicada nesta etapa (também: ${other}).`;
          // Marca o primeiro também, para os dois aparecerem na revisão.
          const twin = results.find(
            (r) => r.stageNumber === stage.number && r.playerName === other,
          );
          if (twin && !twin.needsReview) {
            twin.needsReview = true;
            twin.reviewNote = `Colocação ${placement}º aparece duplicada nesta etapa (também: ${name}).`;
          }
        } else {
          used.set(placement, name);
        }
        placementsUsed.set(stage.number, used);
      }

      results.push({
        playerName: name,
        stageNumber: stage.number,
        points,
        placement,
        needsReview,
        reviewNote,
      });
    }

    spreadsheetTotals.set(name, total);
  }

  return {
    pointsTable,
    pointsBelowCutoff,
    players,
    stages,
    results,
    spreadsheetTotals,
  };
}
