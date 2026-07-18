/**
 * Tipos das linhas do banco, espelhando `supabase/migrations/0001_schema.sql`.
 *
 * Atenção aos `numeric`: o driver do Postgres devolve colunas numeric como
 * STRING para não perder precisão. Sempre passe esses campos por `toNumber()`
 * antes de fazer conta — é a origem clássica de "R$ 150150" na tela.
 */

export type PlayerType = "socio" | "convidado" | "indefinido";
export type StageStatus = "scheduled" | "completed";
export type InviteeSource = "auto" | "manual";

export interface SeasonRow {
  id: string;
  year: number;
  name: string;
  is_current: boolean;
  created_at: string;
}

export interface PlayerRow {
  id: string;
  full_name: string;
  type: PlayerType;
  member_number: string | null;
  invited_by_name: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface StageRow {
  id: string;
  season_id: string;
  number: number;
  event_date: string;
  is_final: boolean;
  is_october_cutoff: boolean;
  status: StageStatus;
  gross_amount_override: string | number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface StageEntryRow {
  id: string;
  stage_id: string;
  player_id: string;
  placement: number | null;
  points: number;
  amount_paid: string | number | null;
  rebuys: number | null;
  had_addon: boolean | null;
  prize_amount: string | number;
  needs_review: boolean;
  review_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface SeasonSettingsRow {
  season_id: string;
  buyin: string | number;
  rebuy: string | number;
  addon: string | number;
  final_reserve_pct: string | number;
  prize_first_pct: string | number;
  prize_second_pct: string | number;
  prize_fourth_fixed: string | number;
  points_below_cutoff: number;
  final_invite_count: number;
  updated_at: string;
}

export interface PointsTableRow {
  season_id: string;
  placement: number;
  points: number;
}

export interface FinalInviteeRow {
  stage_id: string;
  player_id: string;
  source: InviteeSource;
  rank_at_invite: number | null;
  created_at: string;
}

/** Converte `numeric` (string) do Postgres em número. Preserva null. */
export function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Igual a `toNumber`, mas com valor padrão quando vier null. */
export function toNumberOr(value: string | number | null | undefined, fallback: number): number {
  return toNumber(value) ?? fallback;
}
