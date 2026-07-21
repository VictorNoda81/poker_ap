/**
 * Leitura da planilha de classificação (sócio × convidado).
 *
 * É a planilha de ranking com um sufixo em cada nome na coluna B:
 *   "LIGIA - C"        -> Ligia, convidado
 *   "RODOLFO NEGRÃO - A" -> Rodolfo Negrão, sócio (A = associado)
 *
 * Só nos interessa a coluna de nomes; a pontuação é ignorada aqui.
 */

import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { normalizePlayerName } from "./parse-ranking";

export type Classification = "socio" | "convidado";

export interface RosterEntry {
  /** Nome já normalizado, sem o sufixo " - A"/" - C". */
  name: string;
  classification: Classification;
}

const FIRST_PLAYER_ROW = 4;
const NAME_COLUMN = "B";

/** Separa o sufixo " - A"/" - C" do nome. Tolera espaços extras e caixa. */
export function splitClassification(raw: string): { name: string; letter: string } | null {
  const match = raw.match(/^(.*?)\s*[-–]\s*([ACac])\s*$/);
  if (!match) return null;
  return { name: match[1].trim(), letter: match[2].toUpperCase() };
}

export function parseRosterWorkbook(fileOrBuffer: string | Buffer): RosterEntry[] {
  const buffer = typeof fileOrBuffer === "string" ? readFileSync(fileOrBuffer) : fileOrBuffer;
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("Planilha sem abas.");

  const entries: RosterEntry[] = [];
  for (let row = FIRST_PLAYER_ROW; row <= 300; row += 1) {
    const cell = sheet[`${NAME_COLUMN}${row}`] as XLSX.CellObject | undefined;
    const raw = cell?.v === undefined || cell?.v === null ? "" : String(cell.v).trim();
    if (!raw) continue;
    // A linha do pote encerra a lista de jogadores.
    if (raw.toUpperCase().includes("10%")) break;

    const split = splitClassification(raw);
    if (!split) continue; // nome sem marca A/C: ignorado

    entries.push({
      name: normalizePlayerName(split.name),
      classification: split.letter === "A" ? "socio" : "convidado",
    });
  }

  return entries;
}
