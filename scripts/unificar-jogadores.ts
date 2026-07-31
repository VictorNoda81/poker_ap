/**
 * Unifica cadastros que são a MESMA pessoa, com nome canônico e tipo definidos
 * à mão (o script genérico `fundir` descobre pares por apelido e não serve
 * quando a grafia certa é a mais curta ou o tipo precisa ser fixado).
 *
 *   npm run unificar            # dry-run: mostra o que faria
 *   npm run unificar -- --apply # grava
 *
 * Para cada par: as participações do cadastro "absorvido" passam para o que
 * "sobrevive"; se os dois jogaram a MESMA etapa (a pessoa entrou duas vezes por
 * engano), a do absorvido é removida e a do sobrevivente fica marcada para
 * revisão — nunca some ponto sem aviso. Depois o nome e o tipo do sobrevivente
 * são ajustados e o cadastro absorvido é apagado.
 *
 * Seguro: mexe só nas referências, nunca no valor gasto/prêmio já lançado.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { normalizeSupabaseUrl } from "../lib/supabase/url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnv({ path: path.join(ROOT, ".env.local") });
loadEnv({ path: path.join(ROOT, ".env") });

const APPLY = process.argv.includes("--apply");

type Tipo = "socio" | "convidado" | "indefinido";

/** Pares a unificar. `sobrevive`/`absorve` são os nomes EXATOS no banco hoje. */
const UNIFICACOES: { sobrevive: string; absorve: string; nome: string; tipo: Tipo }[] = [
  { sobrevive: "Alfredo Soncini", absorve: "Alfredo Socini", nome: "Alfredo Soncini", tipo: "socio" },
  { sobrevive: "Ligia", absorve: "Lígia Masson", nome: "Ligia Masson", tipo: "convidado" },
  { sobrevive: "Silvio de Paula", absorve: "Silvio Pires de Paula", nome: "Silvio de Paula", tipo: "socio" },
  { sobrevive: "David Dotti", absorve: "Davi Dotti", nome: "David Dotti", tipo: "indefinido" },
  { sobrevive: "David Dotti", absorve: "David", nome: "David Dotti", tipo: "indefinido" },
  { sobrevive: "Diogo Barsi", absorve: "Diogo Parci", nome: "Diogo Barsi", tipo: "socio" },
  { sobrevive: "Fabricio Sadi", absorve: "Fabrcicio Sadi", nome: "Fabricio Sadi", tipo: "indefinido" },
  { sobrevive: "Marco Chen", absorve: "Marcos Chen", nome: "Marco Chen", tipo: "indefinido" },
  // Regina tinha três cadastros; sobrevive o de nome correto (socio).
  { sobrevive: "Regina Sevilla", absorve: "Regina", nome: "Regina Sevilla", tipo: "socio" },
  { sobrevive: "Regina Sevilla", absorve: "Regina Sevilha", nome: "Regina Sevilla", tipo: "socio" },
  // Sobrevive o de nome correto para não colidir com o índice único de nome; o
  // tipo (socio/convidado) vem do cadastro classificado.
  { sobrevive: "Olavo Bueno", absorve: "Olavo", nome: "Olavo Bueno", tipo: "socio" },
  { sobrevive: "Miguel Angelieri", absorve: "Miguel", nome: "Miguel Angelieri", tipo: "convidado" },
  { sobrevive: "Rogério Villas Boas", absorve: "Rogério", nome: "Rogério Villas Boas", tipo: "convidado" },
  { sobrevive: "Fabricio Tavares", absorve: "Fabricio", nome: "Fabricio Tavares", tipo: "convidado" },
];

interface Jogador {
  id: string;
  full_name: string;
  type: Tipo;
}

async function buscar(db: SupabaseClient, nome: string): Promise<Jogador | null> {
  const { data } = await db.from("players").select("id, full_name, type").eq("full_name", nome);
  if (!data || data.length === 0) return null;
  if (data.length > 1) throw new Error(`Mais de um cadastro com o nome exato "${nome}".`);
  return data[0] as Jogador;
}

async function main() {
  const db = createClient(
    normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL!),
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  console.log(
    APPLY ? "\nAPLICANDO unificações...\n" : "\nSIMULAÇÃO (nada será gravado). Use -- --apply.\n",
  );

  for (const u of UNIFICACOES) {
    const sobrevive = await buscar(db, u.sobrevive);
    const absorve = await buscar(db, u.absorve);

    if (!sobrevive && !absorve) {
      console.log(`•  "${u.nome}": nenhum dos dois cadastros existe — nada a fazer.`);
      continue;
    }
    if (!absorve) {
      // Já unificado antes; só garante nome e tipo no que restou.
      console.log(`•  "${u.nome}": já unificado. Confere nome/tipo do sobrevivente.`);
      if (APPLY && sobrevive) await ajustarNomeETipo(db, sobrevive.id, u.nome, u.tipo);
      continue;
    }
    if (!sobrevive) {
      // O "absorve" existe mas o "sobrevive" não: promove o absorve.
      console.log(`→  "${u.nome}": promovendo "${absorve.full_name}" (sobrevivente ausente).`);
      if (APPLY) await ajustarNomeETipo(db, absorve.id, u.nome, u.tipo);
      continue;
    }

    // Participações do absorvido, separando as que colidem com etapas do sobrevivente.
    const [{ data: doAbsorve }, { data: doSobrevive }] = await Promise.all([
      db.from("stage_entries").select("id, stage_id").eq("player_id", absorve.id),
      db.from("stage_entries").select("stage_id").eq("player_id", sobrevive.id),
    ]);
    const etapasDoSobrevive = new Set((doSobrevive ?? []).map((e) => e.stage_id as string));
    const conflitos = (doAbsorve ?? []).filter((e) => etapasDoSobrevive.has(e.stage_id as string));
    const transferiveis = (doAbsorve ?? []).filter((e) => !etapasDoSobrevive.has(e.stage_id as string));

    console.log(
      `${APPLY ? "→" : "•"}  "${u.nome}" [${u.tipo}]  ⬅  "${absorve.full_name}"   ` +
        `${transferiveis.length} participações transferidas` +
        (conflitos.length ? `, ${conflitos.length} em etapa já disputada (mantida a do sobrevivente)` : ""),
    );

    if (!APPLY) continue;

    if (transferiveis.length > 0) {
      const { error } = await db
        .from("stage_entries")
        .update({ player_id: sobrevive.id })
        .in("id", transferiveis.map((e) => e.id));
      if (error) throw new Error(`transferir participações: ${error.message}`);
    }

    if (conflitos.length > 0) {
      await db.from("stage_entries").delete().in("id", conflitos.map((e) => e.id));
      await db
        .from("stage_entries")
        .update({
          needs_review: true,
          review_note: "Unificação de cadastro: a pessoa constava duas vezes nesta etapa.",
        })
        .eq("player_id", sobrevive.id)
        .in("stage_id", conflitos.map((e) => e.stage_id));
    }

    // Convites da Etapa Final que apontavam para o absorvido.
    const { data: convites } = await db
      .from("final_invitees")
      .select("stage_id")
      .eq("player_id", sobrevive.id);
    const etapasComConvite = new Set((convites ?? []).map((c) => c.stage_id as string));
    const { data: convitesAbsorve } = await db
      .from("final_invitees")
      .select("stage_id")
      .eq("player_id", absorve.id);
    for (const c of convitesAbsorve ?? []) {
      if (etapasComConvite.has(c.stage_id as string)) {
        await db.from("final_invitees").delete().eq("player_id", absorve.id).eq("stage_id", c.stage_id);
      } else {
        await db
          .from("final_invitees")
          .update({ player_id: sobrevive.id })
          .eq("player_id", absorve.id)
          .eq("stage_id", c.stage_id);
      }
    }

    await ajustarNomeETipo(db, sobrevive.id, u.nome, u.tipo);

    const { error: delErr } = await db.from("players").delete().eq("id", absorve.id);
    if (delErr) throw new Error(`remover "${absorve.full_name}": ${delErr.message}`);
  }

  console.log(APPLY ? "\n✓ Unificações aplicadas.\n" : "\nRode com -- --apply para gravar.\n");
}

/** Ajusta nome e tipo, zerando o campo incompatível com o tipo (constraint do banco). */
async function ajustarNomeETipo(db: SupabaseClient, id: string, nome: string, tipo: Tipo) {
  const patch: Record<string, unknown> = { full_name: nome, type: tipo };
  if (tipo === "socio") patch.invited_by_name = null;
  else if (tipo === "convidado") patch.member_number = null;
  else {
    patch.member_number = null;
    patch.invited_by_name = null;
  }
  const { error } = await db.from("players").update(patch).eq("id", id);
  if (error) throw new Error(`ajustar "${nome}": ${error.message}`);
}

main().catch((error) => {
  console.error("\n✖ Erro:", error instanceof Error ? error.message : error);
  process.exit(1);
});
