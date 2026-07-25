"use server";

/**
 * Server Actions do painel de administração.
 *
 * TODA action começa com `requireAdmin()`. Proteger apenas o layout impediria a
 * navegação, mas não impediria alguém de fazer um POST direto no endpoint da
 * action — por isso a checagem é repetida aqui, uma por uma.
 *
 * As escritas usam o cliente `service_role`, que ignora RLS. Ele nunca sai do
 * servidor: `lib/supabase/admin.ts` importa `server-only`.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_POINTS_TABLE } from "@/lib/domain/scoring";

export type ActionResult = { ok: true; message?: string } | { ok: false; message: string };

/** Revalida as telas que dependem dos dados alterados. */
function revalidateEverything() {
  revalidatePath("/", "layout");
}

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function optionalText(formData: FormData, key: string): string | null {
  const value = text(formData, key);
  return value === "" ? null : value;
}

function number(formData: FormData, key: string, fallback: number): number {
  // Aceita tanto "1234.56" quanto "1.234,56" — o admin digita como quiser.
  const raw = text(formData, key).replace(/\s/g, "");
  if (raw === "") return fallback;
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Converte o texto de um campo de dinheiro em número, ou null se vazio. */
function optionalNumber(formData: FormData, key: string): number | null {
  const raw = text(formData, key).replace(/\s/g, "");
  if (raw === "") return null;
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

// ===========================================================================
// Temporadas
// ===========================================================================

export async function createSeason(formData: FormData): Promise<void> {
  await requireAdmin();
  const db = getAdminClient();

  const year = Math.trunc(number(formData, "ano", 0));
  if (year < 2000 || year > 2100) {
    redirect("/admin/temporadas?erro=" + encodeURIComponent("Ano inválido."));
  }

  const tornarAtual = formData.get("atual") === "on";

  // Só pode existir uma temporada marcada como atual (índice parcial no banco).
  if (tornarAtual) {
    await db.from("seasons").update({ is_current: false }).eq("is_current", true);
  }

  const { data, error } = await db
    .from("seasons")
    .insert({ year, name: `Temporada ${year}`, is_current: tornarAtual })
    .select("id")
    .single();

  if (error) {
    redirect("/admin/temporadas?erro=" + encodeURIComponent(error.message));
  }

  // Configurações padrão + tabela de pontuação da nova temporada.
  await db.from("season_settings").insert({ season_id: data!.id });
  await db.from("points_table").insert(
    Object.entries(DEFAULT_POINTS_TABLE).map(([placement, points]) => ({
      season_id: data!.id,
      placement: Number(placement),
      points,
    })),
  );

  revalidateEverything();
  redirect("/admin/temporadas?ok=" + encodeURIComponent(`Temporada ${year} criada.`));
}

export async function setCurrentSeason(formData: FormData): Promise<void> {
  await requireAdmin();
  const db = getAdminClient();
  const id = text(formData, "id");

  await db.from("seasons").update({ is_current: false }).eq("is_current", true);
  const { error } = await db.from("seasons").update({ is_current: true }).eq("id", id);

  revalidateEverything();
  redirect(
    error
      ? "/admin/temporadas?erro=" + encodeURIComponent(error.message)
      : "/admin/temporadas?ok=" + encodeURIComponent("Temporada atual atualizada."),
  );
}

// ===========================================================================
// Jogadores
// ===========================================================================

export async function savePlayer(formData: FormData): Promise<void> {
  await requireAdmin();
  const db = getAdminClient();

  const id = optionalText(formData, "id");
  const fullName = text(formData, "nome");
  const type = text(formData, "tipo") as "socio" | "convidado" | "indefinido";

  if (!fullName) {
    redirect("/admin/jogadores?erro=" + encodeURIComponent("O nome completo é obrigatório."));
  }
  if (!["socio", "convidado", "indefinido"].includes(type)) {
    redirect("/admin/jogadores?erro=" + encodeURIComponent("Tipo de jogador inválido."));
  }

  // As colunas opcionais só valem para o tipo correspondente — o banco tem
  // CHECK constraints garantindo isso, então limpamos antes de gravar.
  const payload = {
    full_name: fullName,
    type,
    member_number: type === "socio" ? optionalText(formData, "numeroSocio") : null,
    invited_by_name: type === "convidado" ? optionalText(formData, "convidadoPor") : null,
    notes: optionalText(formData, "observacoes"),
  };

  const { error } = id
    ? await db.from("players").update(payload).eq("id", id)
    : await db.from("players").insert(payload);

  if (error) {
    const message = error.message.includes("players_unique_name")
      ? `Já existe um jogador chamado "${fullName}".`
      : error.message;
    redirect("/admin/jogadores?erro=" + encodeURIComponent(message));
  }

  revalidateEverything();
  redirect(
    "/admin/jogadores?ok=" +
      encodeURIComponent(id ? "Jogador atualizado." : `${fullName} cadastrado.`),
  );
}

export async function deletePlayer(formData: FormData): Promise<void> {
  await requireAdmin();
  const db = getAdminClient();
  const id = text(formData, "id");

  const { error } = await db.from("players").delete().eq("id", id);

  revalidateEverything();
  redirect(
    error
      ? "/admin/jogadores?erro=" +
          encodeURIComponent(
            "Não é possível excluir um jogador que já participou de etapas. " +
              "Remova as participações antes.",
          )
      : "/admin/jogadores?ok=" + encodeURIComponent("Jogador excluído."),
  );
}

// ===========================================================================
// Etapas
// ===========================================================================

export async function saveStage(formData: FormData): Promise<void> {
  await requireAdmin();
  const db = getAdminClient();

  const id = optionalText(formData, "id");
  const seasonId = text(formData, "temporada");
  const stageNumber = Math.trunc(number(formData, "numero", 0));
  const eventDate = text(formData, "data");
  const isFinal = formData.get("final") === "on";
  const isCutoff = formData.get("corte") === "on";

  if (!seasonId || stageNumber < 1 || !eventDate) {
    redirect("/admin/etapas?erro=" + encodeURIComponent("Preencha temporada, número e data."));
  }

  const payload = {
    season_id: seasonId,
    number: stageNumber,
    event_date: eventDate,
    is_final: isFinal,
    is_october_cutoff: isCutoff,
    status: text(formData, "status") === "completed" ? "completed" : "scheduled",
    notes: optionalText(formData, "observacoes"),
  };

  // Só pode haver uma Final e um corte por temporada (índices parciais).
  if (isFinal) {
    await db
      .from("stages")
      .update({ is_final: false })
      .eq("season_id", seasonId)
      .eq("is_final", true);
  }
  if (isCutoff) {
    await db
      .from("stages")
      .update({ is_october_cutoff: false })
      .eq("season_id", seasonId)
      .eq("is_october_cutoff", true);
  }

  const { data, error } = id
    ? await db.from("stages").update(payload).eq("id", id).select("id").single()
    : await db.from("stages").insert(payload).select("id").single();

  if (error) {
    const message = error.message.includes("stages_season_id_number_key")
      ? `Já existe a etapa ${stageNumber} nessa temporada.`
      : error.message;
    redirect("/admin/etapas?erro=" + encodeURIComponent(message));
  }

  revalidateEverything();
  redirect(`/admin/etapas/${data!.id}?ok=` + encodeURIComponent("Etapa salva."));
}

export async function deleteStage(formData: FormData): Promise<void> {
  await requireAdmin();
  const db = getAdminClient();

  const { error } = await db.from("stages").delete().eq("id", text(formData, "id"));

  revalidateEverything();
  redirect(
    error
      ? "/admin/etapas?erro=" + encodeURIComponent(error.message)
      : "/admin/etapas?ok=" + encodeURIComponent("Etapa excluída."),
  );
}

// ===========================================================================
// Resultados de uma etapa
// ===========================================================================

/** Uma linha do formulário de lançamento. */
export interface StageEntryInput {
  playerId: string;
  /** null = participou em 16º ou pior, sem posição exata. */
  placement: number | null;
  points: number;
  amountPaid: number | null;
  rebuys: number | null;
  hadAddon: boolean | null;
  prizeAmount: number;
}

/**
 * Grava o resultado completo de uma etapa.
 *
 * Substitui as participações da etapa pelo que veio do formulário: quem foi
 * removido da lista some, quem foi adicionado entra. Salvar o resultado
 * também marca a etapa como realizada e limpa a flag de revisão das linhas
 * tocadas, já que o admin acabou de confirmar os dados.
 */
export async function saveStageResults(formData: FormData): Promise<void> {
  await requireAdmin();
  const db = getAdminClient();

  const stageId = text(formData, "etapa");
  if (!stageId) redirect("/admin/etapas?erro=" + encodeURIComponent("Etapa não informada."));

  let entries: StageEntryInput[];
  try {
    entries = JSON.parse(text(formData, "participantes")) as StageEntryInput[];
  } catch {
    redirect(`/admin/etapas/${stageId}?erro=` + encodeURIComponent("Dados do formulário inválidos."));
  }

  // Arrecadação informada manualmente. Fica null quando todos os participantes
  // têm despesa lançada — aí o total sai da soma e não pode divergir.
  const grossOverride = optionalNumber(formData, "arrecadacaoManual");

  const { error: stageError } = await db
    .from("stages")
    .update({
      status: entries.length > 0 ? "completed" : "scheduled",
      gross_amount_override: grossOverride,
      // Custos da etapa: entram na cascata antes da reserva da Etapa Final.
      admin_fee_per_player: optionalNumber(formData, "taxaPorJogador"),
      other_costs: optionalNumber(formData, "outrosCustos") ?? 0,
    })
    .eq("id", stageId);
  if (stageError) {
    redirect(`/admin/etapas/${stageId}?erro=` + encodeURIComponent(stageError.message));
  }

  // Remove quem saiu da lista.
  // Os UUIDs vão entre aspas: é como o PostgREST espera uma lista de `in`.
  const keepIds = entries.map((entry) => `"${entry.playerId}"`);
  const removal = db.from("stage_entries").delete().eq("stage_id", stageId);
  const { error: deleteError } = keepIds.length
    ? await removal.not("player_id", "in", `(${keepIds.join(",")})`)
    : await removal;
  if (deleteError) {
    redirect(`/admin/etapas/${stageId}?erro=` + encodeURIComponent(deleteError.message));
  }

  if (entries.length > 0) {
    const rows = entries.map((entry) => ({
      stage_id: stageId,
      player_id: entry.playerId,
      placement: entry.placement,
      points: entry.points,
      amount_paid: entry.amountPaid,
      rebuys: entry.rebuys,
      had_addon: entry.hadAddon,
      prize_amount: entry.prizeAmount,
      // O admin acabou de conferir esta linha.
      needs_review: false,
      review_note: null,
    }));

    const { error } = await db
      .from("stage_entries")
      .upsert(rows, { onConflict: "stage_id,player_id" });
    if (error) {
      redirect(`/admin/etapas/${stageId}?erro=` + encodeURIComponent(error.message));
    }
  }

  revalidateEverything();
  redirect(`/admin/etapas/${stageId}?ok=` + encodeURIComponent("Resultado salvo."));
}

// ===========================================================================
// Configurações da temporada
// ===========================================================================

/** A coluna tem CHECK 0..100; sem isto um erro de digitação vira erro do banco. */
function clampPct(value: number): number {
  return Math.min(100, Math.max(0, value));
}

export async function saveSettings(formData: FormData): Promise<void> {
  await requireAdmin();
  const db = getAdminClient();

  const seasonId = text(formData, "temporada");
  if (!seasonId) {
    redirect("/admin/configuracoes?erro=" + encodeURIComponent("Temporada não informada."));
  }

  const { error } = await db.from("season_settings").upsert(
    {
      season_id: seasonId,
      buyin: number(formData, "buyin", 150),
      rebuy: number(formData, "rebuy", 100),
      addon: number(formData, "addon", 150),
      final_reserve_pct: number(formData, "reserva", 10),
      prize_first_pct: number(formData, "premio1", 50),
      prize_second_pct: number(formData, "premio2", 30),
      prize_third_pct: number(formData, "premio3", 18),
      prize_fourth_pct: number(formData, "premio4", 13),
      admin_fee_per_player: number(formData, "taxaAdmin", 60),
      ranking_share_pct: clampPct(number(formData, "rankingShare", 50)),
      ranking_first_pct: number(formData, "ranking1", 50),
      ranking_second_pct: number(formData, "ranking2", 30),
      ranking_third_pct: number(formData, "ranking3", 20),
      points_below_cutoff: Math.trunc(number(formData, "pontosAbaixo", 5)),
      final_invite_count: Math.trunc(number(formData, "convidadosFinal", 20)),
    },
    { onConflict: "season_id" },
  );

  if (error) {
    redirect(`/admin/configuracoes?temporada=${seasonId}&erro=` + encodeURIComponent(error.message));
  }

  // Tabela de pontuação: um campo "pontos-N" por colocação.
  const pontos: { season_id: string; placement: number; points: number }[] = [];
  for (const [key, value] of formData.entries()) {
    const match = /^pontos-(\d+)$/.exec(key);
    if (!match) continue;
    const parsed = Number(String(value).trim());
    if (!Number.isFinite(parsed) || parsed < 0) continue;
    pontos.push({
      season_id: seasonId,
      placement: Number(match[1]),
      points: Math.trunc(parsed),
    });
  }

  if (pontos.length > 0) {
    const { error: pointsError } = await db
      .from("points_table")
      .upsert(pontos, { onConflict: "season_id,placement" });
    if (pointsError) {
      redirect(
        `/admin/configuracoes?temporada=${seasonId}&erro=` + encodeURIComponent(pointsError.message),
      );
    }
  }

  revalidateEverything();
  redirect(
    `/admin/configuracoes?temporada=${seasonId}&ok=` +
      encodeURIComponent("Configurações salvas. Elas valem para as próximas etapas."),
  );
}

// ===========================================================================
// Preferências globais do app
// ===========================================================================

export async function saveAppSettings(formData: FormData): Promise<void> {
  await requireAdmin();
  const db = getAdminClient();

  // Checkbox: presente = ligado. É "mostrar", então ausência = ocultar.
  const showPlayerFinances = formData.get("mostrarFinancas") !== null;

  const { error } = await db
    .from("app_settings")
    .update({ show_player_finances: showPlayerFinances, updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) {
    redirect("/admin/configuracoes?erro=" + encodeURIComponent(error.message));
  }

  revalidateEverything();
  redirect(
    "/admin/configuracoes?ok=" +
      encodeURIComponent(
        showPlayerFinances
          ? "Pago, saldo e ROI voltaram a aparecer na área pública."
          : "Pago, saldo e ROI ficaram ocultos na área pública. O prêmio continua visível.",
      ),
  );
}

// ===========================================================================
// Etapa Final
// ===========================================================================

export async function saveFinalInvitees(formData: FormData): Promise<void> {
  await requireAdmin();
  const db = getAdminClient();

  const stageId = text(formData, "etapa");
  if (!stageId) {
    redirect("/admin/final?erro=" + encodeURIComponent("Nenhuma Etapa Final definida."));
  }

  let convidados: { playerId: string; source: "auto" | "manual"; rank: number | null }[];
  try {
    convidados = JSON.parse(text(formData, "convidados"));
  } catch {
    redirect("/admin/final?erro=" + encodeURIComponent("Dados do formulário inválidos."));
  }

  await db.from("final_invitees").delete().eq("stage_id", stageId);

  if (convidados.length > 0) {
    const { error } = await db.from("final_invitees").insert(
      convidados.map((c) => ({
        stage_id: stageId,
        player_id: c.playerId,
        source: c.source,
        rank_at_invite: c.rank,
      })),
    );
    if (error) redirect("/admin/final?erro=" + encodeURIComponent(error.message));
  }

  revalidateEverything();
  redirect(
    "/admin/final?ok=" + encodeURIComponent(`Lista salva com ${convidados.length} convidados.`),
  );
}
