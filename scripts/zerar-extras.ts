/**
 * Preenche zero re-buys e nenhum add-on nas participações do histórico.
 *
 *   npm run zerar-extras                    # dry-run: mostra o que faria
 *   npm run zerar-extras -- --apply         # grava
 *   npm run zerar-extras -- --ate=2026-06-30
 *   npm run zerar-extras -- --desfazer --apply   # volta tudo para "não registrado"
 *
 * Por que existe: a liga só passou a anotar re-buy e add-on por jogador a
 * partir da etapa 7 de 2026. Sem nenhum valor, o app trata toda participação
 * antiga como "não registrado" e esconde as estatísticas de re-buy atrás de um
 * "—". Por decisão do dono da liga, o histórico passa a valer como zero.
 *
 * ATENÇÃO ao que isso significa: zero aqui é uma CONVENÇÃO, não um fato
 * observado. Houve re-buy nessas etapas; ninguém anotou. A partir da etapa
 * seguinte os números passam a ser reais, e a soma da temporada 2026 mistura as
 * duas coisas.
 *
 * Segurança:
 *   - só toca em linhas onde rebuys E had_addon estão nulos, então nunca
 *     sobrescreve um lançamento de verdade;
 *   - só alcança etapas concluídas até a data de corte (padrão: hoje), então
 *     rodar de novo não atinge etapas futuras;
 *   - `--desfazer` reverte, para o caso de a liga mudar de ideia.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { normalizeSupabaseUrl } from "../lib/supabase/url";
import { stageName } from "../lib/domain/stage-name";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnv({ path: path.join(ROOT, ".env.local") });
loadEnv({ path: path.join(ROOT, ".env") });

const APPLY = process.argv.includes("--apply");
const DESFAZER = process.argv.includes("--desfazer");
const ATE =
  process.argv.find((a) => a.startsWith("--ate="))?.split("=")[1] ??
  new Date().toISOString().slice(0, 10);

async function main() {
  const db = createClient(
    normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL!),
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: stages, error } = await db
    .from("stages")
    .select("id, number, event_date, is_final, season_id, status")
    .eq("status", "completed")
    .lte("event_date", ATE)
    .order("event_date");
  if (error) {
    console.error(`✖ ${error.message}`);
    process.exit(1);
  }

  const ids = (stages ?? []).map((s) => s.id as string);
  if (ids.length === 0) {
    console.log(`\nNenhuma etapa concluída até ${ATE}.\n`);
    return;
  }

  // Alvo: participações sem NENHUM dos dois campos preenchidos (no desfazer, o
  // inverso — as que estão zeradas e nunca tiveram lançamento real).
  const alvo = () => {
    const q = db.from("stage_entries").select("*", { count: "exact", head: true }).in("stage_id", ids);
    return DESFAZER ? q.eq("rebuys", 0).eq("had_addon", false) : q.is("rebuys", null).is("had_addon", null);
  };

  const { count } = await alvo();
  const valores = DESFAZER ? { rebuys: null, had_addon: null } : { rebuys: 0, had_addon: false };

  console.log(
    `\n${DESFAZER ? "DESFAZER" : "ZERAR"} re-buys/add-ons em ${ids.length} etapas concluídas até ${ATE}.`,
  );
  console.log(`${count ?? 0} participações seriam alteradas.\n`);

  for (const s of stages ?? []) {
    const { count: n } = await (DESFAZER
      ? db.from("stage_entries").select("*", { count: "exact", head: true }).eq("stage_id", s.id).eq("rebuys", 0).eq("had_addon", false)
      : db.from("stage_entries").select("*", { count: "exact", head: true }).eq("stage_id", s.id).is("rebuys", null).is("had_addon", null));
    if ((n ?? 0) > 0) {
      console.log(`  ${stageName(s.number, s.event_date, s.is_final)}  ${n} participações`);
    }
  }

  if (!APPLY) {
    console.log("\nSimulação. Rode com -- --apply para gravar.\n");
    return;
  }

  const update = db.from("stage_entries").update(valores).in("stage_id", ids);
  const { error: upError } = await (DESFAZER
    ? update.eq("rebuys", 0).eq("had_addon", false)
    : update.is("rebuys", null).is("had_addon", null));
  if (upError) {
    console.error(`\n✖ ${upError.message}`);
    process.exit(1);
  }

  console.log(`\n✓ ${count ?? 0} participações atualizadas.`);
  if (!DESFAZER) {
    console.log(
      "\nℹ Zero aqui é convenção, não fato: houve re-buy nessas etapas, mas\n" +
        "  ninguém anotou. Das próximas em diante os números são reais.\n",
    );
  }
}

main().catch((error) => {
  console.error("\n✖ Erro:", error instanceof Error ? error.message : error);
  process.exit(1);
});
