/**
 * Envelope de carregamento das páginas públicas.
 *
 * Existe para um clone recém-baixado, ainda sem `.env.local`, abrir uma tela de
 * instruções em vez de estourar erro 500 — e para qualquer falha de consulta
 * virar uma mensagem legível em vez de stack trace.
 */

import { isSupabaseConfigured } from "@/lib/supabase/public";

export type LoadResult<T> =
  | { status: "unconfigured" }
  | { status: "error"; message: string }
  | { status: "ok"; data: T };

export async function load<T>(loader: () => Promise<T>): Promise<LoadResult<T>> {
  if (!isSupabaseConfigured()) return { status: "unconfigured" };
  try {
    return { status: "ok", data: await loader() };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Erro desconhecido.",
    };
  }
}
