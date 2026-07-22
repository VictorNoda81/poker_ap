/**
 * Leituras da área pública.
 *
 * Estratégia: em vez de espalhar agregações em SQL, carregamos as linhas da
 * temporada (são poucas centenas — ~56 jogadores × ~10 etapas) e agregamos em
 * TypeScript com as funções puras de `lib/domain/`. Assim o mesmo código que
 * roda em produção é o que os testes verificam contra a planilha real.
 */

import { round2 } from "@/lib/domain/money";
import { suggestStagePrizes, type PrizeSettings } from "@/lib/domain/prizes";
import {
  buildRanking,
  derivePlacements,
  type RankingEntry,
  type RankingPlayer,
  type RankingRow,
} from "@/lib/domain/ranking";
import { getPublicClient } from "@/lib/supabase/public";
import {
  toNumber,
  toNumberOr,
  type PlayerRow,
  type PointsTableRow,
  type SeasonRow,
  type SeasonSettingsRow,
  type StageEntryRow,
  type StageRow,
} from "./types";

export interface SeasonSettings extends PrizeSettings {
  rebuy: number;
  pointsBelowCutoff: number;
  finalInviteCount: number;
}

export const FALLBACK_SETTINGS: SeasonSettings = {
  buyin: 160,
  rebuy: 100,
  addon: 150,
  adminFeePerPlayer: 60,
  finalReservePct: 10,
  firstPct: 42,
  secondPct: 27,
  thirdPct: 18,
  fourthPct: 13,
  pointsBelowCutoff: 5,
  finalInviteCount: 20,
};

export interface StageSummary {
  id: string;
  number: number;
  eventDate: string;
  isFinal: boolean;
  isOctoberCutoff: boolean;
  status: "scheduled" | "completed";
  /** Arrecadação: o valor informado manualmente ou a soma do que os jogadores gastaram. */
  gross: number;
  /** true quando a arrecadação veio de `gross_amount_override`, não do detalhe por jogador. */
  grossIsManual: boolean;
  /** Taxa de administração cobrada por jogador nesta etapa. */
  adminFeePerPlayer: number;
  /** Taxa × jogadores. */
  adminFeeTotal: number;
  /** Troféu, garçons e afins. */
  otherCosts: number;
  /** adminFeeTotal + otherCosts — o que sai da arrecadação sem ir a jogador. */
  deductions: number;
  reserve: number;
  /**
   * Prêmios da etapa. Quando ninguém teve prêmio lançado individualmente (é o
   * caso de todo o histórico importado das planilhas), vale a diferença entre a
   * arrecadação e a reserva da Etapa Final — que foi, de fato, o que a mesa
   * distribuiu. `prizesEstimated` diz qual dos dois está em uso.
   */
  prizesPaid: number;
  prizesEstimated: boolean;
  /** Soma dos prêmios efetivamente lançados por jogador (0 se nenhum). */
  prizesRecorded: number;
  participantCount: number;
  /** Participantes cuja despesa ainda não foi lançada. */
  missingFinancials: number;
  needsReviewCount: number;
}

export interface SeasonBundle {
  season: SeasonRow;
  settings: SeasonSettings;
  pointsTable: Record<number, number>;
  stages: StageSummary[];
  players: RankingPlayer[];
  entries: RankingEntry[];
  ranking: RankingRow[];
  /** Total acumulado dos 10% para a Etapa Final. */
  accumulatedReserve: number;
  /** Quanto da reserva já foi pago na Etapa Final (se ela já aconteceu). */
  totals: {
    gross: number;
    prizesPaid: number;
    participations: number;
  };
}

function mapPlayer(row: PlayerRow): RankingPlayer {
  return {
    id: row.id,
    fullName: row.full_name,
    type: row.type,
    memberNumber: row.member_number,
    invitedByName: row.invited_by_name,
  };
}

function mapSettings(row: SeasonSettingsRow | null): SeasonSettings {
  if (!row) return { ...FALLBACK_SETTINGS };
  return {
    buyin: toNumberOr(row.buyin, FALLBACK_SETTINGS.buyin),
    rebuy: toNumberOr(row.rebuy, FALLBACK_SETTINGS.rebuy),
    addon: toNumberOr(row.addon, FALLBACK_SETTINGS.addon),
    adminFeePerPlayer: toNumberOr(row.admin_fee_per_player, FALLBACK_SETTINGS.adminFeePerPlayer),
    finalReservePct: toNumberOr(row.final_reserve_pct, FALLBACK_SETTINGS.finalReservePct),
    firstPct: toNumberOr(row.prize_first_pct, FALLBACK_SETTINGS.firstPct),
    secondPct: toNumberOr(row.prize_second_pct, FALLBACK_SETTINGS.secondPct),
    thirdPct: toNumberOr(row.prize_third_pct, FALLBACK_SETTINGS.thirdPct),
    fourthPct: toNumberOr(row.prize_fourth_pct, FALLBACK_SETTINGS.fourthPct),
    pointsBelowCutoff: row.points_below_cutoff ?? FALLBACK_SETTINGS.pointsBelowCutoff,
    finalInviteCount: row.final_invite_count ?? FALLBACK_SETTINGS.finalInviteCount,
  };
}

/** Temporadas cadastradas, da mais recente para a mais antiga. */
export async function listSeasons(): Promise<SeasonRow[]> {
  const { data, error } = await getPublicClient()
    .from("seasons")
    .select("*")
    .order("year", { ascending: false });
  if (error) throw new Error(`Erro ao listar temporadas: ${error.message}`);
  return (data ?? []) as SeasonRow[];
}

/** A temporada marcada como atual; se não houver nenhuma, a mais recente. */
export async function getCurrentSeason(): Promise<SeasonRow | null> {
  const seasons = await listSeasons();
  return seasons.find((s) => s.is_current) ?? seasons[0] ?? null;
}

export async function getSeasonByYear(year: number): Promise<SeasonRow | null> {
  const { data, error } = await getPublicClient()
    .from("seasons")
    .select("*")
    .eq("year", year)
    .maybeSingle();
  if (error) throw new Error(`Erro ao buscar temporada ${year}: ${error.message}`);
  return (data as SeasonRow) ?? null;
}

/**
 * Carrega tudo de uma temporada e já devolve o ranking calculado.
 *
 * Faz 4 consultas paralelas e agrega em memória — mais simples de auditar do
 * que views SQL, e o volume de dados da liga é pequeno.
 */
export async function getSeasonBundle(season: SeasonRow): Promise<SeasonBundle> {
  const db = getPublicClient();

  const [stagesResult, playersResult, settingsResult, pointsResult] = await Promise.all([
    db.from("stages").select("*").eq("season_id", season.id).order("number"),
    db.from("players").select("*").order("full_name"),
    db.from("season_settings").select("*").eq("season_id", season.id).maybeSingle(),
    db.from("points_table").select("*").eq("season_id", season.id).order("placement"),
  ]);

  if (stagesResult.error) throw new Error(`Erro ao carregar etapas: ${stagesResult.error.message}`);
  if (playersResult.error) throw new Error(`Erro ao carregar jogadores: ${playersResult.error.message}`);
  if (pointsResult.error) throw new Error(`Erro ao carregar pontuação: ${pointsResult.error.message}`);

  const stageRows = (stagesResult.data ?? []) as StageRow[];
  const playerRows = (playersResult.data ?? []) as PlayerRow[];
  const settings = mapSettings((settingsResult.data as SeasonSettingsRow) ?? null);

  const pointsTable: Record<number, number> = {};
  for (const row of (pointsResult.data ?? []) as PointsTableRow[]) {
    pointsTable[row.placement] = row.points;
  }

  // Participações de todas as etapas da temporada.
  const stageIds = stageRows.map((s) => s.id);
  let entryRows: StageEntryRow[] = [];
  if (stageIds.length > 0) {
    const { data, error } = await db.from("stage_entries").select("*").in("stage_id", stageIds);
    if (error) throw new Error(`Erro ao carregar participações: ${error.message}`);
    entryRows = (data ?? []) as StageEntryRow[];
  }

  // A colocação vem deduzida da pontuação da etapa (ver `derivePlacements`), e
  // não da coluna `placement`: abaixo do corte a planilha não registrava posição.
  const entries: RankingEntry[] = derivePlacements(
    entryRows.map((row) => ({
      stageId: row.stage_id,
      playerId: row.player_id,
      placement: row.placement,
      points: row.points,
      amountPaid: toNumber(row.amount_paid),
      prizeAmount: toNumberOr(row.prize_amount, 0),
    })),
  );

  // --- Resumo por etapa ----------------------------------------------------
  const byStage = new Map<string, StageEntryRow[]>();
  for (const row of entryRows) {
    const list = byStage.get(row.stage_id);
    if (list) list.push(row);
    else byStage.set(row.stage_id, [row]);
  }

  const stages: StageSummary[] = stageRows.map((row) => {
    const stageEntries = byStage.get(row.id) ?? [];
    const override = toNumber(row.gross_amount_override);

    const sumPaid = stageEntries.reduce((sum, e) => sum + (toNumber(e.amount_paid) ?? 0), 0);
    // O valor informado manualmente tem precedência: é o caso das etapas
    // importadas da planilha, onde só o total do pote é conhecido.
    const gross = override ?? sumPaid;

    // Cascata da etapa: taxa de administração, outros custos e prêmio do 5º
    // saem antes de calcular os 10% da reserva.
    const adminFeePerPlayer = toNumber(row.admin_fee_per_player) ?? settings.adminFeePerPlayer;
    const otherCosts = toNumberOr(row.other_costs, 0);
    const temQuinto = stageEntries.some((e) => e.placement === 5);
    // Reserva registrada na origem (histórico) manda sobre a fórmula.
    const reserveOverride = toNumber(row.reserve_override);

    const breakdown = suggestStagePrizes(
      {
        gross,
        participants: stageEntries.length,
        adminFeePerPlayer,
        otherCosts,
        reserveOverride,
      },
      settings,
      temQuinto ? [1, 2, 3, 4, 5] : [1, 2, 3, 4],
    );

    // A Etapa Final não separa reserva nova — ela distribui o acumulado do ano.
    const reserve = row.is_final ? 0 : breakdown.reserve;

    const prizesRecorded = stageEntries.reduce(
      (sum, e) => sum + toNumberOr(e.prize_amount, 0),
      0,
    );
    // Sem prêmio lançado por jogador, o que a mesa distribuiu foi a arrecadação
    // menos os custos e menos a reserva.
    const prizesEstimated = prizesRecorded === 0 && gross > 0;
    const deductions = round2(breakdown.adminFeeTotal + otherCosts);

    return {
      id: row.id,
      number: row.number,
      eventDate: row.event_date,
      isFinal: row.is_final,
      isOctoberCutoff: row.is_october_cutoff,
      status: row.status,
      gross,
      grossIsManual: override !== null,
      adminFeePerPlayer,
      adminFeeTotal: breakdown.adminFeeTotal,
      otherCosts,
      deductions,
      reserve,
      prizesPaid: prizesEstimated ? round2(gross - deductions - reserve) : prizesRecorded,
      prizesEstimated,
      prizesRecorded,
      participantCount: stageEntries.length,
      missingFinancials: stageEntries.filter((e) => toNumber(e.amount_paid) === null).length,
      needsReviewCount: stageEntries.filter((e) => e.needs_review).length,
    };
  });

  const players = playerRows.map(mapPlayer);
  const ranking = buildRanking(players, entries);

  return {
    season,
    settings,
    pointsTable,
    stages,
    players,
    entries,
    ranking,
    accumulatedReserve: stages.reduce((sum, s) => sum + s.reserve, 0),
    totals: {
      gross: stages.reduce((sum, s) => sum + s.gross, 0),
      prizesPaid: stages.reduce((sum, s) => sum + s.prizesPaid, 0),
      participations: entryRows.length,
    },
  };
}

export interface StageEntryDetail {
  player: RankingPlayer;
  /** Colocação registrada. null quando a planilha só marcou "16º ou pior". */
  placement: number | null;
  /**
   * Colocação real na etapa, derivada da pontuação: quem empata em pontos
   * divide a mesma colocação. Preenche o buraco de quem entrou como "16º+".
   */
  displayPlacement: number;
  points: number;
  amountPaid: number | null;
  prizeAmount: number;
  rebuys: number | null;
  hadAddon: boolean | null;
  needsReview: boolean;
  reviewNote: string | null;
}

export interface StageDetail {
  stage: StageSummary;
  season: SeasonRow;
  settings: SeasonSettings;
  entries: StageEntryDetail[];
}

/** Resultado completo de uma etapa, ordenado por colocação. */
export async function getStageDetail(stageId: string): Promise<StageDetail | null> {
  const db = getPublicClient();

  const { data: stageRow, error } = await db
    .from("stages")
    .select("*")
    .eq("id", stageId)
    .maybeSingle();
  if (error) throw new Error(`Erro ao buscar etapa: ${error.message}`);
  if (!stageRow) return null;

  const stage = stageRow as StageRow;

  const { data: seasonRow } = await db
    .from("seasons")
    .select("*")
    .eq("id", stage.season_id)
    .maybeSingle();
  if (!seasonRow) return null;

  const bundle = await getSeasonBundle(seasonRow as SeasonRow);
  const summary = bundle.stages.find((s) => s.id === stageId);
  if (!summary) return null;

  const { data: entryRows, error: entriesError } = await db
    .from("stage_entries")
    .select("*")
    .eq("stage_id", stageId);
  if (entriesError) throw new Error(`Erro ao carregar resultado: ${entriesError.message}`);

  const playersById = new Map(bundle.players.map((p) => [p.id, p]));

  const rows = (entryRows ?? []) as StageEntryRow[];

  // Mesma dedução usada no ranking, para a etapa e a ficha do jogador nunca
  // discordarem sobre em que lugar alguém terminou.
  const colocacaoDe = new Map(
    derivePlacements(
      rows.map((r) => ({
        stageId: r.stage_id,
        id: r.id,
        points: r.points,
        placement: r.placement,
      })),
    ).map(
      (r) => [r.id, r.placement] as const,
    ),
  );

  const entries: StageEntryDetail[] = rows
    .map((row) => ({
      player: playersById.get(row.player_id) ?? {
        id: row.player_id,
        fullName: "Jogador removido",
        type: "indefinido" as const,
        memberNumber: null,
        invitedByName: null,
      },
      placement: row.placement,
      displayPlacement: colocacaoDe.get(row.id) ?? 1,
      points: row.points,
      amountPaid: toNumber(row.amount_paid),
      prizeAmount: toNumberOr(row.prize_amount, 0),
      rebuys: row.rebuys,
      hadAddon: row.had_addon,
      needsReview: row.needs_review,
      reviewNote: row.review_note,
    }))
    .sort(compareStageEntries);

  return { stage: summary, season: bundle.season, settings: bundle.settings, entries };
}

/** Ordena o resultado da etapa pela colocação real; empate resolve por nome. */
export function compareStageEntries(a: StageEntryDetail, b: StageEntryDetail): number {
  if (a.displayPlacement !== b.displayPlacement) return a.displayPlacement - b.displayPlacement;
  return a.player.fullName.localeCompare(b.player.fullName, "pt-BR");
}

export interface PlayerStageResult {
  seasonYear: number;
  stageId: string;
  stageNumber: number;
  eventDate: string;
  isFinal: boolean;
  /** Colocação real na etapa (deduzida da pontuação). */
  placement: number;
  points: number;
  amountPaid: number | null;
  prizeAmount: number;
}

export interface PlayerDetail {
  player: RankingPlayer;
  notes: string | null;
  /** Uma linha por temporada em que o jogador participou. */
  bySeason: {
    season: SeasonRow;
    row: RankingRow;
    results: PlayerStageResult[];
  }[];
  career: {
    stagesPlayed: number;
    totalPoints: number;
    totalPaid: number;
    totalReceived: number;
    balance: number;
    wins: number;
    bestPlacement: number | null;
  };
}

/** Ficha completa de um jogador, temporada a temporada. */
export async function getPlayerDetail(playerId: string): Promise<PlayerDetail | null> {
  const db = getPublicClient();

  const { data: playerRow, error } = await db
    .from("players")
    .select("*")
    .eq("id", playerId)
    .maybeSingle();
  if (error) throw new Error(`Erro ao buscar jogador: ${error.message}`);
  if (!playerRow) return null;

  const player = mapPlayer(playerRow as PlayerRow);
  const seasons = await listSeasons();

  const bySeason: PlayerDetail["bySeason"] = [];
  const career = {
    stagesPlayed: 0,
    totalPoints: 0,
    totalPaid: 0,
    totalReceived: 0,
    balance: 0,
    wins: 0,
    bestPlacement: null as number | null,
  };

  for (const season of seasons) {
    const bundle = await getSeasonBundle(season);
    const row = bundle.ranking.find((r) => r.player.id === playerId);
    if (!row || row.stagesPlayed === 0) continue;

    const stagesById = new Map(bundle.stages.map((s) => [s.id, s]));
    const results: PlayerStageResult[] = bundle.entries
      .filter((e) => e.playerId === playerId)
      .map((entry) => {
        const stage = stagesById.get(entry.stageId)!;
        return {
          seasonYear: season.year,
          stageId: stage.id,
          stageNumber: stage.number,
          eventDate: stage.eventDate,
          isFinal: stage.isFinal,
          placement: entry.placement,
          points: entry.points,
          amountPaid: entry.amountPaid,
          prizeAmount: entry.prizeAmount,
        };
      })
      .sort((a, b) => a.stageNumber - b.stageNumber);

    bySeason.push({ season, row, results });

    career.stagesPlayed += row.stagesPlayed;
    career.totalPoints += row.totalPoints;
    career.totalPaid += row.totalPaid;
    career.totalReceived += row.totalReceived;
    career.wins += row.wins;
    if (row.bestPlacement !== null) {
      career.bestPlacement =
        career.bestPlacement === null
          ? row.bestPlacement
          : Math.min(career.bestPlacement, row.bestPlacement);
    }
  }

  career.balance = career.totalReceived - career.totalPaid;

  return { player, notes: (playerRow as PlayerRow).notes, bySeason, career };
}

/** Lista de convidados já salva para uma Etapa Final. */
export async function getFinalInvitees(
  stageId: string,
): Promise<{ playerId: string; source: "auto" | "manual"; rank: number | null }[]> {
  const { data, error } = await getPublicClient()
    .from("final_invitees")
    .select("player_id, source, rank_at_invite")
    .eq("stage_id", stageId)
    .order("rank_at_invite", { nullsFirst: false });
  if (error) throw new Error(`Erro ao carregar convidados: ${error.message}`);

  return (data ?? []).map((row) => ({
    playerId: row.player_id as string,
    source: row.source as "auto" | "manual",
    rank: (row.rank_at_invite as number | null) ?? null,
  }));
}

/** Todos os jogadores cadastrados, para a listagem pública. */
export async function listPlayers(): Promise<RankingPlayer[]> {
  const { data, error } = await getPublicClient()
    .from("players")
    .select("*")
    .order("full_name");
  if (error) throw new Error(`Erro ao listar jogadores: ${error.message}`);
  return ((data ?? []) as PlayerRow[]).map(mapPlayer);
}

export interface PlayerSeasonStat {
  year: number;
  position: number;
  points: number;
  stagesPlayed: number;
  wins: number;
  totalPaid: number;
  totalReceived: number;
  balance: number;
  averagePoints: number;
  averagePlacement: number | null;
  /** Soma das colocações registradas e nº de etapas com colocação — para
   *  reagregar as médias quando o usuário seleciona várias temporadas. */
  placementSum: number;
  placedStages: number;
  /** Melhor colocação numa ETAPA e quantas vezes a atingiu. */
  bestPlacement: number | null;
  bestPlacementCount: number;
  /** Etapas do jogador ainda sem o valor gasto lançado. */
  stagesMissingFinancials: number;
  /** true se terminou em 1º numa temporada JÁ ENCERRADA (campeão de verdade). */
  isChampion: boolean;
}

export interface PlayerAcrossSeasons {
  player: RankingPlayer;
  /** Estatística de cada temporada em que participou (ano -> stat). */
  bySeasonYear: Record<number, PlayerSeasonStat>;
}

/**
 * Estatísticas de todos os jogadores em todas as temporadas, para o diretório
 * de jogadores poder filtrar por temporada e somar o histórico. Um jogador só
 * ganha entrada de um ano em que efetivamente participou.
 */
export async function getPlayersAcrossSeasons(): Promise<{
  seasons: { year: number; name: string }[];
  players: PlayerAcrossSeasons[];
}> {
  const seasons = await listSeasons();

  // As temporadas são independentes — carrega todas em paralelo.
  const bundles = await Promise.all(
    seasons.map(async (season) => ({ season, bundle: await getSeasonBundle(season) })),
  );

  const byId = new Map<string, PlayerAcrossSeasons>();
  const ensure = (player: RankingPlayer): PlayerAcrossSeasons => {
    let entry = byId.get(player.id);
    if (!entry) {
      entry = { player, bySeasonYear: {} };
      byId.set(player.id, entry);
    }
    return entry;
  };

  for (const { season, bundle } of bundles) {
    // Só há campeão em temporada encerrada; na que está correndo há líder.
    const encerrada = !bundle.stages.some((s) => s.status === "scheduled");

    for (const row of bundle.ranking) {
      // Garante que todo jogador cadastrado apareça, mesmo sem participação —
      // mas só registra o ano quando ele jogou.
      const entry = ensure(row.player);
      if (row.stagesPlayed === 0) continue;
      entry.bySeasonYear[season.year] = {
        year: season.year,
        position: row.position,
        points: row.totalPoints,
        stagesPlayed: row.stagesPlayed,
        wins: row.wins,
        totalPaid: row.totalPaid,
        totalReceived: row.totalReceived,
        balance: row.balance,
        averagePoints: row.averagePoints,
        averagePlacement: row.averagePlacement,
        placementSum: row.placementSum,
        placedStages: row.placedStages,
        bestPlacement: row.bestPlacement,
        bestPlacementCount: row.bestPlacementCount,
        stagesMissingFinancials: row.stagesMissingFinancials,
        isChampion: encerrada && row.displayPosition === 1,
      };
    }
  }

  const players = [...byId.values()].sort((a, b) =>
    a.player.fullName.localeCompare(b.player.fullName, "pt-BR"),
  );

  return {
    seasons: seasons.map((s) => ({ year: s.year, name: s.name })),
    players,
  };
}
