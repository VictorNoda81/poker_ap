/**
 * Seed da temporada 2026 a partir de `data/2026.xlsx`.
 *
 *   npm run seed
 *
 * É IDEMPOTENTE: pode rodar quantas vezes quiser. Tudo usa upsert com chave
 * natural (ano da temporada, nome do jogador, número da etapa, par etapa+jogador),
 * então rodar de novo atualiza em vez de duplicar.
 *
 * O que ele NÃO faz, de propósito:
 *   - Não inventa valor gasto nem prêmio por jogador. A planilha não tem esse
 *     dado; só o total do pote por etapa. Preencha pelo painel de admin, na
 *     tela de lançamento retroativo.
 *   - Não classifica ninguém como sócio ou convidado: todo mundo entra como
 *     "indefinido", destacado no admin até você definir.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { parse2026Workbook, type Parsed2026 } from "../lib/import/parse-2026";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const WORKBOOK = path.join(ROOT, "data", "2026.xlsx");

// .env.local tem precedência (padrão do Next), depois .env.
loadEnv({ path: path.join(ROOT, ".env.local") });
loadEnv({ path: path.join(ROOT, ".env") });

const SEASON_YEAR = 2026;

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

async function seedSeason(db: SupabaseClient, parsed: Parsed2026) {
  console.log(`→ Temporada ${SEASON_YEAR}`);

  const { data: season, error } = await db
    .from("seasons")
    .upsert(
      { year: SEASON_YEAR, name: `Temporada ${SEASON_YEAR}`, is_current: true },
      { onConflict: "year" },
    )
    .select()
    .single();
  if (error) fail("criar temporada", error);

  const seasonId = season!.id as string;

  // Configurações padrão da liga. `ignoreDuplicates` para não sobrescrever
  // ajustes que o admin já tenha feito ao rodar o seed de novo.
  const { error: settingsError } = await db.from("season_settings").upsert(
    {
      season_id: seasonId,
      buyin: 150,
      rebuy: 100,
      addon: 150,
      final_reserve_pct: 10,
      prize_first_pct: 50,
      prize_second_pct: 30,
      prize_fourth_fixed: 150,
      points_below_cutoff: parsed.pointsBelowCutoff,
      final_invite_count: 20,
    },
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

  console.log(`  ✓ configurações e tabela de pontuação (${pointsRows.length} colocações)`);
  return seasonId;
}

async function seedPlayers(db: SupabaseClient, parsed: Parsed2026) {
  console.log(`→ Jogadores (${parsed.players.length})`);

  const rows = parsed.players.map((full_name) => ({ full_name, type: "indefinido" as const }));

  // O índice único é sobre lower(btrim(full_name)), que o PostgREST não aceita
  // como alvo de onConflict. Então buscamos o que já existe e inserimos só o resto.
  const { data: existing, error: readError } = await db.from("players").select("id, full_name");
  if (readError) fail("ler jogadores", readError);

  const byName = new Map<string, string>();
  for (const row of existing ?? []) {
    byName.set(String(row.full_name).trim().toLowerCase(), row.id as string);
  }

  const missing = rows.filter((r) => !byName.has(r.full_name.toLowerCase()));
  if (missing.length > 0) {
    const { data: inserted, error } = await db.from("players").insert(missing).select("id, full_name");
    if (error) fail("inserir jogadores", error);
    for (const row of inserted ?? []) {
      byName.set(String(row.full_name).trim().toLowerCase(), row.id as string);
    }
  }

  console.log(`  ✓ ${missing.length} novos, ${rows.length - missing.length} já existiam`);
  return byName;
}

async function seedStages(db: SupabaseClient, seasonId: string, parsed: Parsed2026) {
  console.log(`→ Etapas (${parsed.stages.length})`);

  const rows = parsed.stages.map((stage) => ({
    season_id: seasonId,
    number: stage.number,
    event_date: stage.date,
    // Sem arrecadação registrada = etapa que ainda não aconteceu.
    status: stage.grossAmount === null ? ("scheduled" as const) : ("completed" as const),
    gross_amount_override: stage.grossAmount,
  }));

  const { data, error } = await db
    .from("stages")
    .upsert(rows, { onConflict: "season_id,number" })
    .select("id, number");
  if (error) fail("gravar etapas", error);

  const byNumber = new Map<number, string>();
  for (const row of data ?? []) byNumber.set(row.number as number, row.id as string);

  const realizadas = rows.filter((r) => r.status === "completed").length;
  console.log(`  ✓ ${realizadas} realizadas, ${rows.length - realizadas} agendada(s)`);
  return byNumber;
}

async function seedEntries(
  db: SupabaseClient,
  parsed: Parsed2026,
  playerIds: Map<string, string>,
  stageIds: Map<number, string>,
) {
  console.log(`→ Participações (${parsed.results.length})`);

  const rows = parsed.results.map((result) => {
    const stageId = stageIds.get(result.stageNumber);
    const playerId = playerIds.get(result.playerName.toLowerCase());
    if (!stageId) throw new Error(`Etapa ${result.stageNumber} não encontrada.`);
    if (!playerId) throw new Error(`Jogador "${result.playerName}" não encontrado.`);

    return {
      stage_id: stageId,
      player_id: playerId,
      placement: result.placement,
      points: result.points,
      // amount_paid e prize_amount ficam vazios: a planilha não trazia esse dado.
      amount_paid: null,
      prize_amount: 0,
      needs_review: result.needsReview,
      review_note: result.reviewNote,
    };
  });

  // Em lotes, para não estourar o limite de payload do PostgREST.
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await db
      .from("stage_entries")
      .upsert(rows.slice(i, i + BATCH), { onConflict: "stage_id,player_id" });
    if (error) fail("gravar participações", error);
  }

  const revisar = rows.filter((r) => r.needs_review).length;
  console.log(`  ✓ ${rows.length} participações (${revisar} marcadas para revisão)`);
  return revisar;
}

async function main() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const db = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`\nLendo ${path.relative(ROOT, WORKBOOK)}...\n`);
  const parsed = parse2026Workbook(WORKBOOK);

  const seasonId = await seedSeason(db, parsed);
  const playerIds = await seedPlayers(db, parsed);
  const stageIds = await seedStages(db, seasonId, parsed);
  const revisar = await seedEntries(db, parsed, playerIds, stageIds);

  // --- Conferência final, contra os números da própria planilha -------------
  const reservaTotal = parsed.stages.reduce((sum, s) => sum + (s.reserveAmount ?? 0), 0);
  const lider = [...parsed.spreadsheetTotals.entries()].sort((a, b) => b[1] - a[1])[0];

  console.log("\n────────────────────────────────────────────");
  console.log("Seed concluído.");
  console.log(`  Jogadores ............. ${parsed.players.length}`);
  console.log(`  Etapas ................ ${parsed.stages.length}`);
  console.log(`  Participações ......... ${parsed.results.length}`);
  console.log(`  Líder do ranking ...... ${lider[0]} (${lider[1]} pontos)`);
  console.log(`  Reserva da Final ...... R$ ${reservaTotal.toLocaleString("pt-BR")}`);
  console.log("────────────────────────────────────────────");

  if (revisar > 0) {
    console.log(
      `\n⚠ ${revisar} participações ficaram marcadas para revisão (colocações\n` +
        `  duplicadas na planilha original). As etapas afetadas aparecem em\n` +
        `  /admin sob "Pendências" — abra a etapa e confira as colocações.`,
    );
  }
  console.log(
    "\nℹ Valores gastos e prêmios das etapas passadas não vieram na planilha.\n" +
      "  Preencha em /admin/etapas > Lançamento retroativo.\n",
  );
}

main().catch((error) => {
  console.error("\n✖ Erro inesperado no seed:", error);
  process.exit(1);
});
