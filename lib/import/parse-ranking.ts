/**
 * Leitura das planilhas de ranking da liga (uma por temporada).
 *
 * Todas seguem o mesmo layout, montado à mão ano a ano:
 *   linha 2   -> a partir da coluna C, a DATA de cada etapa (série do Excel);
 *                a coluna "TOTAL DE PONTOS" também mora nessa linha, mas é texto
 *   linha 3   -> rótulos "PONTOS"
 *   linha 4+  -> A = posição, B = nome do jogador, colunas de data = pontos
 *   linha N   -> "10% DO POTE POR RODADA": a reserva da Final de cada etapa
 *
 * O número de etapas varia por ano (7 em 2026, 9 em 2024/2025, 10 em 2023),
 * então as colunas de etapa são DETECTADAS pela linha de datas em vez de
 * fixadas — a coluna de total, por ser texto, fica naturalmente de fora.
 *
 * Limitações das planilhas, e como lidamos com elas:
 *   - Guardam PONTOS, não colocação. Invertemos pela tabela de pontuação
 *     (55 -> 1º, 48 -> 2º, ...); como cada colocação de 1º a 15º vale um número
 *     distinto, a inversão é exata nessa faixa.
 *   - 5 pontos = "16º ou pior", sem posição exata -> placement NULL.
 *   - 0 pontos (ou célula vazia) = não participou -> sem registro.
 *   - Colocações DUPLICADAS na mesma etapa e pontuações que não existem na
 *     tabela (typos como "42" ou "16") são erros do arquivo original:
 *     importamos preservando o valor e marcamos `needsReview`.
 *   - Sem valor gasto nem prêmio por jogador. Só o total do pote por etapa,
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

const HEADER_DATE_ROW = 2;
const FIRST_PLAYER_ROW = 4;
/** Colunas varridas em busca de datas de etapa. B é o nome; começa em C. */
const SCAN_COLUMNS = "CDEFGHIJKLMNOPQRSTU".split("");
/** Faixa plausível para uma série de data do Excel (2009–2064, grosso modo). */
const MIN_DATE_SERIAL = 40_000;
const MAX_DATE_SERIAL = 60_000;

/** Sinais diacríticos que o NFD separa das letras (U+0300–U+036F). */
const DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g");

/**
 * Erros de digitação das planilhas, confirmados pelo dono da liga.
 *
 * Ficam aqui, e não só no banco, para que um novo seed não traga o valor
 * errado de volta: a planilha é a fonte, mas estas células estão sabidamente
 * erradas. `de` existe para a correção falhar em silêncio se a planilha for
 * consertada na origem (aí o valor já não bate e nada é trocado).
 */
const CORRECOES_DE_PONTOS: {
  ano: number;
  etapa: number;
  jogador: string;
  de: number;
  para: number;
  motivo: string;
}[] = [
  {
    ano: 2023,
    etapa: 10,
    jogador: "Alexandre Max",
    de: 42,
    para: 43,
    motivo: "42 não existe na tabela; ele foi o 3º lugar, que vale 43",
  },
];

/**
 * Apelidos confirmados pelo dono da liga como a mesma pessoa de um nome
 * completo. A chave é o apelido puro (já normalizado); o valor é a chave do
 * nome completo. Sem isto, "Wawa" (2025-26) e "Wagner (Wawa)" (2023-24) ficariam
 * como dois cadastros, porque um não é acento nem parêntese do outro.
 *
 * É a fonte de verdade da fusão: como `playerKey` os unifica, um seed do zero
 * reproduz o mesmo resultado — a fusão não depende de nenhum passo manual.
 * Para fundir um novo apelido no futuro, some uma linha aqui.
 */
const NICKNAME_ALIASES: Record<string, string> = {
  wawa: "wagner",
  peu: "pedro lins",
  armani: "andre armani",
  armando: "joao armando",
  pavelec: "daniel pavelec",
  // Cadastros unificados pela liga (nome/tipo corretos definidos no admin).
  "alfredo socini": "alfredo soncini",
  ligia: "ligia masson",
  "silvio pires de paula": "silvio de paula",
};

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

export interface ParsedRanking {
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
 * Normaliza o nome para EXIBIÇÃO: tira espaços sobrando e converte de CAIXA
 * ALTA para Capitalização de Nome Próprio, mantendo acentos e conectivos em
 * minúsculas.
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
      return word.replace(/(^|\()(\p{L})/gu, (_, prefix: string, letter: string) =>
        prefix + letter.toLocaleUpperCase("pt-BR"),
      );
    })
    .join(" ");
}

/**
 * Chave de IDENTIDADE do jogador entre temporadas.
 *
 * Ignora acento, caixa, espaços e apelidos entre parênteses, para que o mesmo
 * jogador escrito de formas ligeiramente diferentes vire um só cadastro:
 *   "André Echeverria" e "ANDRE ECHEVERRIA"  -> "andre echeverria"
 *   "José Olimpio (JOB)" e "José Olimpio"     -> "jose olimpio"
 *
 * NÃO resolve apelidos puros ("Wagner (Wawa)" × "Wawa"): esses continuam
 * cadastros separados, porque uni-los exige conhecimento que a planilha não dá.
 */
export function playerKey(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(DIACRITICS, "") // tira os acentos
    .replace(/\([^)]*\)/g, "") // tira "(apelido)"
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  // Um apelido confirmado resolve para a chave do nome completo.
  return NICKNAME_ALIASES[base] ?? base;
}

function numberAt(sheet: XLSX.WorkSheet, address: string): number | null {
  const cell = sheet[address] as XLSX.CellObject | undefined;
  if (!cell || cell.v === undefined || cell.v === null || cell.v === "") return null;
  const value = typeof cell.v === "number" ? cell.v : Number(String(cell.v).replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

function textAt(sheet: XLSX.WorkSheet, address: string): string | null {
  const cell = sheet[address] as XLSX.CellObject | undefined;
  if (!cell || cell.v === undefined || cell.v === null) return null;
  const text = String(cell.v).trim();
  return text === "" ? null : text;
}

/**
 * Tabela de pontuação: lida da 2ª aba quando existe (algumas planilhas trazem),
 * senão o padrão da liga. Nas que trazem, ela confere igual ao padrão — mas
 * lemos assim mesmo, para o dia em que algum ano usar valores diferentes.
 */
function parsePointsTable(
  workbook: XLSX.WorkBook,
  seasonSheetName: string,
): { table: PointsTable; belowCutoff: number } {
  const outraAba = workbook.SheetNames.find((nome) => nome !== seasonSheetName);
  const sheet = outraAba ? workbook.Sheets[outraAba] : undefined;
  if (!sheet) {
    return { table: { ...DEFAULT_POINTS_TABLE }, belowCutoff: DEFAULT_POINTS_BELOW_CUTOFF };
  }

  const table: PointsTable = {};
  let belowCutoff = DEFAULT_POINTS_BELOW_CUTOFF;
  let encontrou = 0;

  // Linhas de colocação (1 a 16, a 16ª sendo a faixa "ou pior").
  for (let row = 2; row <= 60; row += 1) {
    const placement = numberAt(sheet, `A${row}`);
    const label = textAt(sheet, `B${row}`);
    if (placement === null || label === null) continue;

    const points = Number(label.replace(/[^\d]/g, ""));
    if (!Number.isFinite(points)) continue;

    encontrou += 1;
    if (placement >= 16) belowCutoff = points;
    else table[placement] = points;
  }

  // A 2ª aba pode ser outra coisa (ex.: um rascunho). Se não parece uma tabela
  // de pontuação, cai no padrão em vez de importar lixo.
  if (encontrou < 10) {
    return { table: { ...DEFAULT_POINTS_TABLE }, belowCutoff: DEFAULT_POINTS_BELOW_CUTOFF };
  }

  return { table, belowCutoff };
}

export function parseRankingWorkbook(fileOrBuffer: string | Buffer): ParsedRanking {
  // Lemos o arquivo aqui em vez de usar XLSX.readFile: a build ESM do xlsx não
  // enxerga o `fs` do Node sem configuração extra.
  const buffer = typeof fileOrBuffer === "string" ? readFileSync(fileOrBuffer) : fileOrBuffer;
  const workbook = XLSX.read(buffer, { type: "buffer" });

  // A aba da temporada é a primeira; o nome varia ("2026", "Plan1", ...).
  const seasonSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[seasonSheetName];
  if (!sheet) throw new Error("Planilha sem abas.");

  const { table: pointsTable, belowCutoff: pointsBelowCutoff } = parsePointsTable(
    workbook,
    seasonSheetName,
  );

  // --- Etapas: colunas cuja linha 2 contém uma data. -----------------------
  // A coluna "TOTAL DE PONTOS" também está na linha 2, mas é texto, então
  // numberAt a ignora e ela fica de fora naturalmente.
  const stages: ParsedStage[] = [];
  for (const column of SCAN_COLUMNS) {
    const serial = numberAt(sheet, `${column}${HEADER_DATE_ROW}`);
    if (serial === null || serial < MIN_DATE_SERIAL || serial > MAX_DATE_SERIAL) continue;
    stages.push({
      number: stages.length + 1,
      date: excelSerialToISO(serial),
      grossAmount: null,
      reserveAmount: null,
      column,
    });
  }
  if (stages.length === 0) throw new Error("Nenhuma etapa encontrada na linha de datas.");

  // O ano sai da primeira etapa — é o que identifica as correções aplicáveis.
  const ano = Number(stages[0].date.slice(0, 4));

  // --- Linha dos 10%: localizada pelo rótulo, não por número fixo. ---------
  let potRow: number | null = null;
  for (let row = FIRST_PLAYER_ROW; row <= 300; row += 1) {
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

  // Por etapa, quais colocações já foram usadas — para achar as duplicatas.
  const placementsUsed = new Map<number, Map<number, string>>();

  const lastRow = potRow ?? 300;
  for (let row = FIRST_PLAYER_ROW; row < lastRow; row += 1) {
    const rawName = textAt(sheet, `B${row}`);
    if (!rawName) continue;

    const name = normalizePlayerName(rawName);
    // Dentro de UMA planilha o mesmo nome não deve se repetir; o de-dup entre
    // temporadas (via playerKey) é feito no seed, não aqui.
    const dedupKey = name.toLowerCase();
    if (seen.has(dedupKey)) {
      throw new Error(`Nome duplicado na planilha (linha ${row}): "${rawName}".`);
    }
    seen.add(dedupKey);
    players.push(name);

    let total = 0;
    for (const stage of stages) {
      const lido = numberAt(sheet, `${stage.column}${row}`);
      // Vazio ou zero = não participou desta etapa.
      if (lido === null || lido === 0) continue;

      // Correção de digitação confirmada, se houver para esta célula.
      const correcao = CORRECOES_DE_PONTOS.find(
        (c) => c.ano === ano && c.etapa === stage.number && c.jogador === name && c.de === lido,
      );
      const points = correcao ? correcao.para : lido;

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

      results.push({ playerName: name, stageNumber: stage.number, points, placement, needsReview, reviewNote });
    }

    spreadsheetTotals.set(name, total);
  }

  return mergeDuplicatePlayers({
    pointsTable,
    pointsBelowCutoff,
    players,
    stages,
    results,
    spreadsheetTotals,
  });
}

/** Mais acentos ganha; empate, o nome mais longo (que costuma trazer o apelido). */
function betterSpelling(a: string, b: string): string {
  const acc = (s: string) => (s.match(/[^\x00-\x7F]/g) ?? []).length;
  if (acc(a) !== acc(b)) return acc(a) > acc(b) ? a : b;
  return a.length >= b.length ? a : b;
}

/**
 * Funde jogadores que aparecem em MAIS DE UMA LINHA da mesma planilha sob
 * grafias diferentes (o caso do "FABIO SEGURA" + "FÁBIO SEGURA" em 2024, a mesma
 * pessoa lançada duas vezes). Escolhe a melhor grafia, junta os resultados e
 * marca tudo para revisão, já que a fonte estava duplicada.
 *
 * Se as duas linhas pontuarem na MESMA etapa — o que não deveria acontecer —,
 * mantém a maior pontuação e sinaliza, em vez de somar (somar dobraria o valor).
 */
function mergeDuplicatePlayers(parsed: ParsedRanking): ParsedRanking {
  const canonicalByKey = new Map<string, string>();
  for (const name of parsed.players) {
    const key = playerKey(name);
    const atual = canonicalByKey.get(key);
    canonicalByKey.set(key, atual ? betterSpelling(name, atual) : name);
  }

  const distinctKeys = canonicalByKey.size;
  if (distinctKeys === parsed.players.length) return parsed; // nada a fundir

  const dupKeys = new Set<string>();
  const vistos = new Set<string>();
  for (const name of parsed.players) {
    const key = playerKey(name);
    if (vistos.has(key)) dupKeys.add(key);
    vistos.add(key);
  }

  const players = [...new Set(parsed.players.map((n) => canonicalByKey.get(playerKey(n))!))];

  const byCanonicalStage = new Map<string, ParsedResult>();
  for (const r of parsed.results) {
    const key = playerKey(r.playerName);
    const canonical = canonicalByKey.get(key)!;
    const flagDup = dupKeys.has(key);
    const nota = flagDup
      ? "Jogador aparecia em mais de uma linha na planilha; os resultados foram unidos."
      : r.reviewNote;

    const mk = `${canonical}#${r.stageNumber}`;
    const existente = byCanonicalStage.get(mk);
    const atual: ParsedResult = {
      ...r,
      playerName: canonical,
      needsReview: r.needsReview || flagDup,
      reviewNote: r.needsReview ? r.reviewNote : nota,
    };

    if (!existente) {
      byCanonicalStage.set(mk, atual);
    } else {
      // Mesma pessoa, mesma etapa, duas vezes: erro de digitação. Fica a maior.
      const maior = atual.points >= existente.points ? atual : existente;
      maior.needsReview = true;
      maior.reviewNote = "Jogador aparecia duas vezes na mesma etapa na planilha.";
      byCanonicalStage.set(mk, maior);
    }
  }

  const results = [...byCanonicalStage.values()];

  const spreadsheetTotals = new Map<string, number>();
  for (const r of results) {
    spreadsheetTotals.set(r.playerName, (spreadsheetTotals.get(r.playerName) ?? 0) + r.points);
  }

  return { ...parsed, players, results, spreadsheetTotals };
}
