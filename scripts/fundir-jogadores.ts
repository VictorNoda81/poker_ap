/**
 * Aplica o mapa de apelidos (`NICKNAME_ALIASES` em `lib/import/parse-ranking.ts`)
 * a um banco JÁ semeado, fundindo cadastros que a mesma `playerKey` agora
 * unifica — sem precisar re-semear.
 *
 *   npm run fundir            # mostra o que seria feito, sem gravar (dry-run)
 *   npm run fundir -- --apply # aplica de verdade
 *
 * Por que existe, se o seed já funde: re-semear zera valores gastos e prêmios
 * que o admin tenha lançado. Este script mexe só nas referências de jogador,
 * então é o caminho seguro para fundir num banco em produção. Ao adicionar um
 * apelido novo ao mapa, rode isto para aplicá-lo ao que já está no ar.
 *
 * Fonte única de verdade: ele NÃO tem lista própria de pares — descobre os
 * cadastros a fundir agrupando os jogadores do banco por `playerKey`.
 * Idempotente: rodar de novo depois de aplicado não encontra nada a fazer.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { normalizeSupabaseUrl } from "../lib/supabase/url";
import { playerKey } from "../lib/import/parse-ranking";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnv({ path: path.join(ROOT, ".env.local") });
loadEnv({ path: path.join(ROOT, ".env") });

const APPLY = process.argv.includes("--apply");

/** Mais acentos ganha; empate, o nome mais longo (que costuma trazer o apelido). */
function melhorGrafia(a: string, b: string): string {
  const acc = (s: string) => (s.match(/[^\x00-\x7F]/g) ?? []).length;
  if (acc(a) !== acc(b)) return acc(a) > acc(b) ? a : b;
  return a.length >= b.length ? a : b;
}

async function mergeInto(
  db: SupabaseClient,
  destino: { id: string; full_name: string },
  origem: { id: string; full_name: string },
): Promise<{ transferidas: number; conflitos: number }> {
  const [{ data: entradasOrigem }, { data: entradasDestino }] = await Promise.all([
    db.from("stage_entries").select("id, stage_id").eq("player_id", origem.id),
    db.from("stage_entries").select("stage_id").eq("player_id", destino.id),
  ]);
  const etapasDoDestino = new Set((entradasDestino ?? []).map((e) => e.stage_id as string));
  const conflitos = (entradasOrigem ?? []).filter((e) => etapasDoDestino.has(e.stage_id as string));
  const transferiveis = (entradasOrigem ?? []).filter((e) => !etapasDoDestino.has(e.stage_id as string));

  if (!APPLY) return { transferidas: transferiveis.length, conflitos: conflitos.length };

  if (transferiveis.length > 0) {
    const { error } = await db
      .from("stage_entries")
      .update({ player_id: destino.id })
      .in("id", transferiveis.map((e) => e.id));
    if (error) throw new Error(`transferir participações: ${error.message}`);
  }

  // Etapa disputada pelos dois cadastros: erro de duplicidade na fonte. Remove a
  // do origem e sinaliza a do destino, para não perder pontos silenciosamente.
  if (conflitos.length > 0) {
    await db.from("stage_entries").delete().in("id", conflitos.map((e) => e.id));
    await db
      .from("stage_entries")
      .update({
        needs_review: true,
        review_note: "Fusão de apelido: havia participação na mesma etapa nos dois cadastros.",
      })
      .eq("player_id", destino.id)
      .in("stage_id", conflitos.map((e) => e.stage_id));
  }

  const { error: delErr } = await db.from("players").delete().eq("id", origem.id);
  if (delErr) throw new Error(`remover "${origem.full_name}": ${delErr.message}`);

  return { transferidas: transferiveis.length, conflitos: conflitos.length };
}

async function main() {
  const db = createClient(
    normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL!),
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: players, error } = await db.from("players").select("id, full_name");
  if (error) {
    console.error("✖ Erro ao ler jogadores:", error.message);
    process.exit(1);
  }

  // Agrupa por chave de identidade (que já aplica os aliases).
  const grupos = new Map<string, { id: string; full_name: string }[]>();
  for (const p of players as { id: string; full_name: string }[]) {
    const k = playerKey(p.full_name);
    (grupos.get(k) ?? grupos.set(k, []).get(k)!).push(p);
  }
  const aFundir = [...grupos.values()].filter((g) => g.length > 1);

  console.log(
    APPLY ? "\nAPLICANDO fusões...\n" : "\nSIMULAÇÃO (nada será gravado). Use -- --apply para aplicar.\n",
  );

  if (aFundir.length === 0) {
    console.log("Nada a fundir — todos os cadastros já estão unificados.\n");
    return;
  }

  let total = 0;
  for (const grupo of aFundir) {
    // O destino é o de melhor grafia; os demais são absorvidos.
    const destino = grupo.reduce((a, b) => ({
      ...a,
      full_name: melhorGrafia(a.full_name, b.full_name),
    }));
    const destinoReal = grupo.find((p) => p.full_name === destino.full_name)!;
    for (const origem of grupo) {
      if (origem.id === destinoReal.id) continue;
      const { transferidas, conflitos } = await mergeInto(db, destinoReal, origem);
      console.log(
        `${APPLY ? "→" : "•"}  "${destinoReal.full_name}" ⬅ "${origem.full_name}"   ` +
          `${transferidas} participações` +
          (conflitos ? `, ${conflitos} em etapa já disputada (mantidas no destino)` : ""),
      );
      total += 1;
    }
  }

  console.log(
    APPLY
      ? `\n✓ ${total} cadastros fundidos.\n`
      : `\nSimulação: ${total} cadastros seriam fundidos. Rode com -- --apply.\n`,
  );
}

main().catch((error) => {
  console.error("\n✖ Erro:", error instanceof Error ? error.message : error);
  process.exit(1);
});
