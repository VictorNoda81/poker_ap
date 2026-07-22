import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnv({ path: path.join(ROOT, ".env.local") });
loadEnv({ path: path.join(ROOT, ".env") });

async function main() {
  const { createClient } = await import("@supabase/supabase-js");
  const { normalizeSupabaseUrl } = await import("../lib/supabase/url");
  const { stageName } = await import("../lib/domain/stage-name");
  const db = createClient(
    normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL!),
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: season } = await db.from("seasons").select("id").eq("year", 2026).single();
  const { data: stages } = await db
    .from("stages").select("id, number, event_date, is_final")
    .eq("season_id", season!.id).order("number");

  for (const s of stages ?? []) {
    const { data: e } = await db
      .from("stage_entries")
      .select("player_id, points, placement, created_at, updated_at")
      .eq("stage_id", s.id)
      .is("placement", null);
    if (!e?.length) continue;
    const { data: nomes } = await db
      .from("players").select("id, full_name").in("id", e.map((x) => x.player_id));
    const nomeDe = new Map((nomes ?? []).map((p) => [p.id as string, p.full_name as string]));
    const ts = [...new Set(e.map((x) => String(x.updated_at).slice(0, 19)))];
    console.log(
      `\n${stageName(s.number, s.event_date, s.is_final)} — ${e.length} sem colocação` +
        `  (updated_at: ${ts.join(" / ")})`,
    );
    console.log("   " + e.map((x) => nomeDe.get(x.player_id)).sort().join(", "));
  }
}
main();
