/**
 * Preenche a premiação das etapas já concluídas, aplicando a regra de
 * distribuição atual sobre a arrecadação conhecida.
 *
 *   npm run premios                 # dry-run: mostra o que faria
 *   npm run premios -- --apply      # grava
 *   npm run premios -- --ano=2025   # outra temporada (padrão: 2026)
 *
 * De onde vem a arrecadação: as planilhas guardavam só a linha "10% do pote",
 * então o total da etapa é esse valor ÷ 10% (× 10). É o mesmo número que já
 * está em `stages.gross_amount_override`.
 *
 * O que NÃO é preenchido: quanto cada jogador GASTOU. Isso ninguém registrou —
 * não dá para saber quem fez re-buy ou add-on —, e inventar um valor faria o
 * app mostrar saldo e ROI errados. Fica em branco.
 *
 * Idempotente: rodar de novo recalcula os mesmos valores.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { normalizeSupabaseUrl } from "../lib/supabase/url";
import { formatBRL } from "../lib/domain/money";
import { suggestStagePrizes, type PrizeSettings } from "../lib/domain/prizes";
import { stageName } from "../lib/domain/stage-name";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnv({ path: path.join(ROOT, ".env.local") });
loadEnv({ path: path.join(ROOT, ".env") });

const APPLY = process.argv.includes("--apply");
/** Zera a premiação da temporada, para anos cuja regra de divisão era outra. */
const LIMPAR = process.argv.includes("--limpar");
const ANO = Number(
  process.argv.find((a) => a.startsWith("--ano="))?.split("=")[1] ?? "2026",
);

/** Colocações que recebem prêmio na regra atual. */
const PREMIADAS = [1, 2, 3, 4, 5];

async function main() {
  const db = createClient(
    normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL!),
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: season } = await db.from("seasons").select("id, name").eq("year", ANO).single();
  if (!season) {
    console.error(`✖ Temporada ${ANO} não encontrada.`);
    process.exit(1);
  }

  const { data: cfg, error: cfgError } = await db
    .from("season_settings")
    .select("*")
    .eq("season_id", season.id)
    .maybeSingle();
  if (cfgError) {
    console.error(`✖ ${cfgError.message}`);
    console.error("  A migration 0004 já foi aplicada no Supabase?");
    process.exit(1);
  }

  const settings: PrizeSettings = {
    finalReservePct: Number(cfg?.final_reserve_pct ?? 10),
    firstPct: Number(cfg?.prize_first_pct ?? 42),
    secondPct: Number(cfg?.prize_second_pct ?? 27),
    thirdPct: Number(cfg?.prize_third_pct ?? 18),
    fourthPct: Number(cfg?.prize_fourth_pct ?? 13),
    buyin: Number(cfg?.buyin ?? 160),
    addon: Number(cfg?.addon ?? 150),
    adminFeePerPlayer: Number(cfg?.admin_fee_per_player ?? 60),
    // Não influenciam a premiação da etapa; só a divisão do Pote Acumulado.
    rankingSharePct: Number(cfg?.ranking_share_pct ?? 50),
    rankingFirstPct: Number(cfg?.ranking_first_pct ?? 50),
    rankingSecondPct: Number(cfg?.ranking_second_pct ?? 30),
    rankingThirdPct: Number(cfg?.ranking_third_pct ?? 20),
  };

  // --limpar: zera a premiação da temporada inteira. Serve para os anos em que
  // a divisão era diferente da atual — preencher com a regra de hoje inventaria
  // valores que a liga não pagou.
  if (LIMPAR) {
    const { data: todasEtapas } = await db.from("stages").select("id").eq("season_id", season.id);
    const ids = (todasEtapas ?? []).map((s) => s.id as string);
    if (ids.length === 0) {
      console.log(`\n${season.name}: sem etapas.\n`);
      return;
    }

    const { count: antes } = await db
      .from("stage_entries")
      .select("*", { count: "exact" })
      .in("stage_id", ids)
      .gt("prize_amount", 0);

    if (!APPLY) {
      console.log(
        `\nSIMULAÇÃO: ${antes ?? 0} prêmios de ${season.name} seriam zerados.` +
          " Rode com -- --apply.\n",
      );
      return;
    }

    const { error } = await db
      .from("stage_entries")
      .update({ prize_amount: 0 })
      .in("stage_id", ids)
      .gt("prize_amount", 0);
    if (error) {
      console.error(`✖ ${error.message}`);
      process.exit(1);
    }
    console.log(`\n✓ ${antes ?? 0} prêmios de ${season.name} zerados.\n`);
    return;
  }

  const { data: stages } = await db
    .from("stages")
    .select(
      "id, number, event_date, is_final, status, gross_amount_override, admin_fee_per_player, other_costs, reserve_override",
    )
    .eq("season_id", season.id)
    .eq("status", "completed")
    .order("number");

  console.log(
    APPLY
      ? `\nAPLICANDO premiação em ${season.name}...\n`
      : `\nSIMULAÇÃO em ${season.name} (nada será gravado). Use -- --apply.\n`,
  );

  let totalAtualizado = 0;
  const avisos: string[] = [];

  for (const stage of stages ?? []) {
    const { data: entries } = await db
      .from("stage_entries")
      .select("id, player_id, placement, prize_amount")
      .eq("stage_id", stage.id);

    const participantes = (entries ?? []).length;
    const gross = Number(stage.gross_amount_override ?? 0);
    if (gross <= 0 || participantes === 0) continue;

    const nome = stageName(stage.number, stage.event_date, stage.is_final);

    // Quem ocupa cada colocação premiada. Duplicata = erro da planilha: não dá
    // para pagar duas pessoas pelo mesmo lugar sem inventar critério.
    const porColocacao = new Map<number, { id: string }[]>();
    for (const e of entries ?? []) {
      if (e.placement === null || !PREMIADAS.includes(e.placement)) continue;
      const lista = porColocacao.get(e.placement) ?? [];
      lista.push({ id: e.id as string });
      porColocacao.set(e.placement, lista);
    }

    const duplicadas = [...porColocacao.entries()].filter(([, l]) => l.length > 1);
    for (const [colocacao, lista] of duplicadas) {
      avisos.push(`${nome}: ${lista.length} jogadores em ${colocacao}º — prêmio não atribuído`);
      porColocacao.delete(colocacao);
    }

    const presentes = [...porColocacao.keys()].sort((a, b) => a - b);
    const breakdown = suggestStagePrizes(
      {
        gross,
        participants: participantes,
        adminFeePerPlayer:
          stage.admin_fee_per_player === null ? null : Number(stage.admin_fee_per_player),
        otherCosts: Number(stage.other_costs ?? 0),
        // Reserva registrada na planilha: é fato, não se recalcula.
        reserveOverride:
          stage.reserve_override === null ? null : Number(stage.reserve_override),
      },
      settings,
      presentes,
    );

    const valorPor = new Map(breakdown.byPlacement.map((p) => [p.placement, p.amount]));

    console.log(
      `${nome}  ${participantes} jogadores  arrecadou ${formatBRL(gross)}  ` +
        `adm ${formatBRL(breakdown.adminFeeTotal)}  reserva ${formatBRL(breakdown.reserve)}`,
    );
    console.log(
      "   " +
        presentes
          .map((p) => `${p}º ${formatBRL(valorPor.get(p) ?? 0)}`)
          .join("   ") +
        `   (total ${formatBRL(breakdown.totalPrizes)})`,
    );

    if (!APPLY) continue;

    for (const colocacao of presentes) {
      const alvo = porColocacao.get(colocacao)![0];
      const { error } = await db
        .from("stage_entries")
        .update({ prize_amount: valorPor.get(colocacao) ?? 0 })
        .eq("id", alvo.id);
      if (error) {
        console.error(`✖ ${nome} ${colocacao}º: ${error.message}`);
        process.exit(1);
      }
      totalAtualizado += 1;
    }
  }

  if (avisos.length > 0) {
    console.log("\n⚠ Colocações duplicadas na planilha original (ficaram sem prêmio):");
    for (const a of avisos) console.log(`   ${a}`);
  }

  console.log(
    APPLY
      ? `\n✓ ${totalAtualizado} prêmios gravados.\n`
      : "\nSimulação concluída. Rode com -- --apply para gravar.\n",
  );
  console.log(
    "ℹ Quanto cada jogador GASTOU continua em branco: não há registro de quem\n" +
      "  fez re-buy ou add-on, e um valor inventado distorceria saldo e ROI.\n",
  );
}

main().catch((error) => {
  console.error("\n✖ Erro:", error instanceof Error ? error.message : error);
  process.exit(1);
});
