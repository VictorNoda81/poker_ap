/**
 * Cliente Supabase de ESCRITA, usado só pelo painel de admin.
 *
 * Usa a chave service_role, que ignora RLS. Por isso este módulo nunca pode
 * ser importado por um Client Component — o `import "server-only"` abaixo faz
 * o build falhar se alguém tentar, em vez de vazar a chave para o navegador.
 */

import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { normalizeSupabaseUrl } from "./url";

let cached: SupabaseClient | null = null;

export function getAdminClient(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Supabase não configurado para escrita: defina NEXT_PUBLIC_SUPABASE_URL e " +
        "SUPABASE_SERVICE_ROLE_KEY (veja .env.example).",
    );
  }

  cached = createClient(normalizeSupabaseUrl(url), serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
