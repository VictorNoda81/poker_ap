/**
 * Seed das temporadas a partir das planilhas em `data/` (2023 a 2026).
 *
 *   npm run seed              # só mostra o que faria
 *   npm run seed -- --apply   # grava
 *
 * PRECISA de `--apply` porque ele REESCREVE pontos e colocações a partir das
 * planilhas. Se a liga corrigiu um resultado pelo painel — e ela corrige —,
 * rodar o seed desfaz a correção sem avisar. Já aconteceu: um seed sem querer
 * ressuscitou uma participação apagada e devolveu três pontuações antigas.
 *
 * É IDEMPOTENTE em relação às planilhas: usa chaves naturais (ano da temporada,
 * número da etapa, par etapa+jogador) e casa jogadores por uma chave de
 * identidade que ignora acento/apelido, então rodar de novo atualiza em vez de
 * duplicar. Idempotente NÃO quer dizer inofensivo — ver o parágrafo acima.
 *
 * Identidade de jogador entre temporadas:
 *   Os nomes variam de um ano para outro ("André"/"ANDRE", "José Olimpio (JOB)"
 *   /"José Olimpio"). `playerKey` normaliza isso para que a mesma pessoa vire um
 *   só cadastro global. Apelidos PUROS ("Wagner (Wawa)" × "Wawa") continuam
 *   separados — uni-los exige conhecimento que a planilha não dá.
 *
 * O que ele NÃO faz, de propósito:
 *   - Não inventa valor gasto nem prêmio por jogador. As planilhas não têm esse
 *     dado; só o total do pote por etapa. Preencha pelo painel de admin.
 *   - Não classifica ninguém como sócio ou convidado: todos entram como
 *     "indefinido", destacados no admin até você definir.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { parseRankingWorkbook, playerKey, type ParsedRanking } from "../lib/import/parse-ranking";
import { CUTOFF_PLACEMENT } from "../lib/domain/scoring";
import { normalizeSupabaseUrl } from "../lib/supabase/url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const DATA = path.join(ROOT, "data");

loadEnv({ path: path.join(ROOT, ".env.local") });
loadEnv({ path: path.join(ROOT, ".env") });

/** Anos a importar e qual é a temporada atual (a que abre na home). */
const SEASONS = [2023, 2024, 2025, 2026];
const CURRENT_YEAR = 2026;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`\n✖ Variável de ambiente ausente: ${name}`);
    console.error("  Copie .env.example para .env.local e preencha os valores.\n");
    process.exit(1);
  }
  return value;
}

function fail(step: string, error: { message: string } | null): never {
  console.error(`\n✖ Falhou em "${step}": ${error?.message ?? "erro desconhecido"}\n`);
  process.exit(1);
}

/** Quantas letras acentuadas o nome tem — usado para escolher a melhor grafia. */
function contarAcentos(nome: string): number {
  return (nome.match(/[^\x00-\x7F]/g) ?? []).length;
}

/**
 * Para cada chave de identidade, escolhe a MELHOR grafia entre todas as vistas:
 * a com mais acentos, depois a mais longa (que costuma trazer o apelido). Assim
 * "André Echeverria" vence "Andre Echeverria", e "José Olimpio (JOB)" vence
 * "José Olimpio".
 */
function escolherGrafias(todosOsNomes: string[]): Map<string, string> {
  const melhor = new Map<string, string>();
  for (const nome of todosOsNomes) {
    const key = playerKey(nome);
    const atual = melhor.get(key);
    if (
      !atual ||
      contarAcentos(nome) > contarAcentos(atual) ||
      (contarAcentos(nome) === contarAcentos(atual) && nome.length > atual.length)
    ) {
      melhor.set(key, nome);
    }
  }
  return melhor;
}

async function seedSeason(db: SupabaseClient, year: number, parsed: ParsedRanking) {
  const { data: season, error } = await db
    .from("seasons")
    .upsert(
      { year, name: `Temporada ${year}`, is_current: year === CURRENT_YEAR },
      { onConflict: "year" },
    )
    .select()
    .single();
  if (error) fail(`criar temporada ${year}`, error);
  const seasonId = season!.id as string;

  const { error: settingsError } = await db.from("season_settings").upsert(
    {
      season_id: seasonId,
      buyin: 160,
      rebuy: 100,
      addon: 150,
      admin_fee_per_player: 60,
      final_reserve_pct: 10,
      prize_first_pct: 42,
      prize_second_pct: 27,
      prize_third_pct: 18,
      prize_fourth_pct: 13,
      points_below_cutoff: parsed.pointsBelowCutoff,
      final_invite_count: 20,
    },
    // ignoreDuplicates: não sobrescreve ajustes que o admin já tenha feito.
    { onConflict: "season_id", ignoreDuplicates: true },
  );
  if (settingsError) fail("gravar configurações", settingsError);

  const pointsRows = Object.entries(parsed.pointsTable).map(([placement, points]) => ({
    season_id: seasonId,
    placement: Number(placement),
    points,
  }));
  const { error: pointsError } = await db
    .from("points_table")
    .upsert(pointsRows, { onConflict: "season_id,placement" });
  if (pointsError) fail("gravar tabela de pontuação", pointsError);

  return seasonId;
}

/**
 * Garante que todos os jogadores de todas as temporadas existam no banco,
 * casando por `playerKey`. Devolve o mapa chave -> id.
 */
async function seedPlayers(
  db: SupabaseClient,
  todosOsNomes: string[],
): Promise<Map<string, string>> {
  const grafias = escolherGrafias(todosOsNomes);

  // Jogadores já no banco, indexados pela chave de identidade.
  const { data: existing, error: readError } = await db.from("players").select("id, full_name");
  if (readError) fail("ler jogadores", readError);

  const keyToId = new Map<string, string>();
  for (const row of existing ?? []) {
    keyToId.set(playerKey(String(row.full_name)), row.id as string);
  }

  const faltando = [...grafias.entries()].filter(([key]) => !keyToId.has(key));
  if (faltando.length > 0) {
    const { data: inserted, error } = await db
      .from("players")
      .insert(faltando.map(([, full_name]) => ({ full_name, type: "indefinido" as const })))
      .select("id, full_name");
    if (error) fail("inserir jogadores", error);
    for (const row of inserted ?? []) {
      keyToId.set(playerKey(String(row.full_name)), row.id as string);
    }
  }

  console.log(
    `→ Jogadores: ${grafias.size} distintos ` +
      `(${faltando.length} novos, ${grafias.size - faltando.length} já existiam)`,
  );
  return keyToId;
}

async function seedStages(db: SupabaseClient, seasonId: string, parsed: ParsedRanking) {
  const rows = parsed.stages.map((stage) => ({
    season_id: seasonId,
    number: stage.number,
    event_date: stage.date,
    status: stage.grossAmount === null ? ("scheduled" as const) : ("completed" as const),
    gross_amount_override: stage.grossAmount,
    // O pote das planilhas já vinha líquido de taxa de administração e outros
    // custos, e o valor da reserva é um fato registrado pela liga — não deve
    // ser recalculado pela cascata atual.
    reserve_override: stage.reserveAmount,
    admin_fee_per_player: 0,
    other_costs: 0,
  }));

  const { data, error } = await db
    .from("stages")
    .upsert(rows, { onConflict: "season_id,number" })
    .select("id, number");
  if (error) fail("gravar etapas", error);

  const byNumber = new Map<number, string>();
  for (const row of data ?? []) byNumber.set(row.number as number, row.id as string);
  return byNumber;
}

async function seedEntries(
  db: SupabaseClient,
  parsed: ParsedRanking,
  keyToId: Map<string, string>,
  stageIds: Map<number, string>,
): Promise<number> {
  // O que foi lançado depois da importação — dinheiro, re-buys e add-ons — tem
  // de sobreviver a um novo seed: reimportar a planilha não pode apagar nada
  // disso. A planilha só sabe pontuação; todo o resto veio do admin ou dos
  // scripts de preenchimento.
  const jaLancado = new Map<
    string,
    {
      amount_paid: unknown;
      prize_amount: unknown;
      rebuys: unknown;
      had_addon: unknown;
      placement: number | null;
    }
  >();
  const ids = [...stageIds.values()];
  if (ids.length > 0) {
    const { data } = await db
      .from("stage_entries")
      .select("stage_id, player_id, amount_paid, prize_amount, rebuys, had_addon, placement")
      .in("stage_id", ids);
    for (const row of data ?? []) {
      jaLancado.set(`${row.stage_id}#${row.player_id}`, {
        amount_paid: row.amount_paid,
        prize_amount: row.prize_amount,
        rebuys: row.rebuys,
        had_addon: row.had_addon,
        placement: (row.placement as number | null) ?? null,
      });
    }
  }

  const rows = parsed.results.map((result) => {
    const stageId = stageIds.get(result.stageNumber);
    const playerId = keyToId.get(playerKey(result.playerName));
    if (!stageId) throw new Error(`Etapa ${result.stageNumber} não encontrada.`);
    if (!playerId) throw new Error(`Jogador "${result.playerName}" não encontrado.`);

    const anterior = jaLancado.get(`${stageId}#${playerId}`);

    return {
      stage_id: stageId,
      player_id: playerId,
      // Colocação abaixo do corte é conhecimento que a planilha NÃO tem: lá
      // todo mundo com 5 pontos fica sem posição. Se alguém digitou 17º, 22º…
      // no painel, veio de quem viu a mesa e o seed não pode apagar.
      placement:
        anterior && anterior.placement !== null && anterior.placement >= CUTOFF_PLACEMENT
          ? anterior.placement
          : result.placement,
      points: result.points,
      amount_paid: anterior?.amount_paid ?? null,
      prize_amount: anterior?.prize_amount ?? 0,
      rebuys: anterior?.rebuys ?? null,
      had_addon: anterior?.had_addon ?? null,
      needs_review: result.needsReview,
      review_note: result.reviewNote,
    };
  });

  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await db
      .from("stage_entries")
      .upsert(rows.slice(i, i + BATCH), { onConflict: "stage_id,player_id" });
    if (error) fail("gravar participações", error);
  }

  return rows.filter((r) => r.needs_review).length;
}

async function main() {
  if (!process.argv.includes("--apply")) {
    const temporadas = SEASONS.map((year) => ({
      year,
      parsed: parseRankingWorkbook(path.join(DATA, `${year}.xlsx`)),
    }));
    console.log("\nSIMULAÇÃO — nada será gravado. Rode com -- --apply para valer.\n");
    for (const { year, parsed } of temporadas) {
      console.log(
        `  ${year}: ${parsed.players.length} jogadores · ${parsed.stages.length} etapas · ` +
          `${parsed.results.length} participações`,
      );
    }
    console.log(
      "\n⚠ O seed grava os pontos e as colocações DAS PLANILHAS por cima do que\n" +
        "  estiver no banco. Correções feitas no painel de admin serão desfeitas.\n" +
        "  Confira antes com: npm run verificar:banco\n",
    );
    return;
  }

  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const db = createClient(normalizeSupabaseUrl(url), serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Lê todas as planilhas primeiro, para escolher a melhor grafia de cada
  // jogador considerando todas as temporadas de uma vez.
  console.log("\nLendo planilhas...");
  const temporadas = SEASONS.map((year) => {
    const arquivo = path.join(DATA, `${year}.xlsx`);
    return { year, parsed: parseRankingWorkbook(arquivo) };
  });

  const todosOsNomes = temporadas.flatMap((t) => t.parsed.players);
  const keyToId = await seedPlayers(db, todosOsNomes);

  let totalParticipacoes = 0;
  let totalRevisar = 0;

  console.log("");
  for (const { year, parsed } of temporadas) {
    const seasonId = await seedSeason(db, year, parsed);
    const stageIds = await seedStages(db, seasonId, parsed);
    const revisar = await seedEntries(db, parsed, keyToId, stageIds);

    const reserva = parsed.stages.reduce((s, e) => s + (e.reserveAmount ?? 0), 0);
    const lider = [...parsed.spreadsheetTotals.entries()].sort((a, b) => b[1] - a[1])[0];

    totalParticipacoes += parsed.results.length;
    totalRevisar += revisar;

    console.log(
      `→ ${year}${year === CURRENT_YEAR ? " (atual)" : "       "}  ` +
        `${String(parsed.players.length).padStart(2)} jogadores  ` +
        `${String(parsed.stages.length).padStart(2)} etapas  ` +
        `${String(parsed.results.length).padStart(3)} participações  ` +
        `líder ${lider[0]} (${lider[1]})  ` +
        `reserva R$ ${reserva.toLocaleString("pt-BR")}` +
        (revisar > 0 ? `  ⚠ ${revisar} a revisar` : ""),
    );
  }

  console.log("\n────────────────────────────────────────────");
  console.log("Seed concluído.");
  console.log(`  Temporadas ............ ${temporadas.length}`);
  console.log(`  Jogadores distintos ... ${keyToId.size}`);
  console.log(`  Participações ......... ${totalParticipacoes}`);
  console.log("────────────────────────────────────────────");

  if (totalRevisar > 0) {
    console.log(
      `\n⚠ ${totalRevisar} participações marcadas para revisão (colocações duplicadas\n` +
        `  ou pontuações fora da tabela nas planilhas originais). As etapas afetadas\n` +
        `  aparecem em /admin sob "Pendências".`,
    );
  }
  console.log(
    "\nℹ Valores gastos e prêmios das etapas passadas não vieram nas planilhas.\n" +
      "  Preencha em /admin/etapas quando quiser.\n",
  );
}

main().catch((error) => {
  console.error("\n✖ Erro inesperado no seed:", error);
  process.exit(1);
});
