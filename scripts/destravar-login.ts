/**
 * Apaga o histórico de tentativas de login, liberando o acesso ao painel.
 *
 *   npm run destravar
 *
 * Serve para quando você errar a senha três vezes e não quiser esperar os 15
 * minutos. Precisa da SUPABASE_SERVICE_ROLE_KEY, ou seja, só funciona para
 * quem já tem acesso ao projeto — não é um caminho de volta para um invasor.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { normalizeSupabaseUrl } from "../lib/supabase/url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnv({ path: path.join(ROOT, ".env.local") });
loadEnv({ path: path.join(ROOT, ".env") });

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !service) {
    console.error("✖ Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const db = createClient(normalizeSupabaseUrl(url), service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { count: antes } = await db
    .from("admin_login_attempts")
    .select("*", { count: "exact" })
    .limit(1);

  // O PostgREST exige um filtro em DELETE, para não apagar tudo por engano.
  // Como aqui apagar tudo É a intenção, usamos um filtro que casa com todas
  // as linhas: created_at anterior a "agora".
  const { error } = await db
    .from("admin_login_attempts")
    .delete()
    .lt("created_at", new Date(Date.now() + 60_000).toISOString());

  if (error) {
    console.error("✖ Erro:", error.message);
    process.exit(1);
  }

  const { count: depois } = await db
    .from("admin_login_attempts")
    .select("*", { count: "exact" })
    .limit(1);

  console.log(`\n✓ Histórico de tentativas limpo (${antes ?? 0} → ${depois ?? 0}).`);
  console.log("  O painel voltou a aceitar 3 tentativas.\n");
}

main().catch((error) => {
  console.error("\n✖ Erro:", error instanceof Error ? error.message : error);
  process.exit(1);
});
