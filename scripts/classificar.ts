/**
 * Aplica a classificação sócio × convidado da planilha
 * `data/2026-classificacao.xlsx` aos jogadores no banco.
 *
 *   npm run classificar            # dry-run: mostra o que faria, sem gravar
 *   npm run classificar -- --apply # aplica de verdade
 *
 * Casa cada nome ao cadastro pelo `playerKey` (os aliases já resolvem
 * "Wawa" -> Wagner, "Pavelec" -> Daniel Pavelec etc.). Nomes que não casarem
 * são listados para você conferir a grafia; nada é inventado.
 *
 * Idempotente: rodar de novo só reescreve o mesmo tipo.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { normalizeSupabaseUrl } from "../lib/supabase/url";
import { playerKey } from "../lib/import/parse-ranking";
import { parseRosterWorkbook } from "../lib/import/parse-roster";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnv({ path: path.join(ROOT, ".env.local") });
loadEnv({ path: path.join(ROOT, ".env") });

const APPLY = process.argv.includes("--apply");
const ROSTER = path.join(ROOT, "data", "2026-classificacao.xlsx");

async function main() {
  const roster = parseRosterWorkbook(ROSTER);
  const socios = roster.filter((r) => r.classification === "socio").length;
  console.log(
    `\nPlanilha: ${roster.length} nomes classificados ` +
      `(${socios} sócios, ${roster.length - socios} convidados).`,
  );

  const db = createClient(
    normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL!),
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: players, error } = await db.from("players").select("id, full_name, type");
  if (error) {
    console.error("✖ Erro ao ler jogadores:", error.message);
    process.exit(1);
  }

  const porChave = new Map<string, { id: string; full_name: string; type: string }>();
  for (const p of players as { id: string; full_name: string; type: string }[]) {
    porChave.set(playerKey(p.full_name), p);
  }

  console.log(APPLY ? "\nAPLICANDO...\n" : "\nSIMULAÇÃO (nada será gravado). Use -- --apply para aplicar.\n");

  const naoCasaram: string[] = [];
  const conflitosNaPlanilha = new Map<string, Set<string>>();
  let atualizados = 0;
  let jaCorretos = 0;

  // Detecta o mesmo jogador marcado com letras diferentes na planilha.
  for (const entry of roster) {
    const key = playerKey(entry.name);
    (conflitosNaPlanilha.get(key) ?? conflitosNaPlanilha.set(key, new Set()).get(key)!).add(
      entry.classification,
    );
  }

  for (const entry of roster) {
    const alvo = porChave.get(playerKey(entry.name));
    if (!alvo) {
      naoCasaram.push(entry.name);
      continue;
    }
    if (alvo.type === entry.classification) {
      jaCorretos += 1;
      continue;
    }

    if (APPLY) {
      // Ao definir o tipo, limpa o campo que não vale mais, respeitando as
      // CHECK constraints (nº de sócio só em sócio; "convidado por" só em convidado).
      const patch =
        entry.classification === "socio"
          ? { type: "socio", invited_by_name: null }
          : { type: "convidado", member_number: null };
      const { error: upErr } = await db.from("players").update(patch).eq("id", alvo.id);
      if (upErr) {
        console.error(`✖ ${alvo.full_name}: ${upErr.message}`);
        process.exit(1);
      }
    }
    console.log(
      `${APPLY ? "→" : "•"}  ${alvo.full_name.padEnd(26)} ${alvo.type} → ${entry.classification}`,
    );
    atualizados += 1;
  }

  const ambiguos = [...conflitosNaPlanilha.entries()].filter(([, set]) => set.size > 1);
  if (ambiguos.length > 0) {
    console.log("\n⚠ Marcados com letras diferentes na planilha (confira):");
    for (const [key] of ambiguos) {
      const nome = roster.find((r) => playerKey(r.name) === key)?.name;
      console.log(`   ${nome}`);
    }
  }

  if (naoCasaram.length > 0) {
    console.log(`\n⚠ ${naoCasaram.length} nomes não casaram com nenhum cadastro:`);
    for (const n of naoCasaram) console.log(`   ${n}`);
  }

  console.log(
    `\n${APPLY ? "✓ Aplicado" : "Simulação"}: ${atualizados} a atualizar, ` +
      `${jaCorretos} já corretos, ${naoCasaram.length} sem correspondência.`,
  );
  if (!APPLY) console.log("Rode com -- --apply para gravar.\n");
  else console.log("");
}

main().catch((error) => {
  console.error("\n✖ Erro:", error instanceof Error ? error.message : error);
  process.exit(1);
});
