-- =============================================================================
-- Novo modelo financeiro da liga
-- =============================================================================
-- A regra de premiação mudou. A cascata passa a ser:
--
--   arrecadação da etapa
--     − taxa de administração (valor fixo POR JOGADOR)
--     − outros custos da etapa (troféu, garçons, ...)
--     − prêmio do 5º lugar (inscrição + 1 add-on)
--     = base da reserva
--          − 10% -> Pote da Etapa Final
--          = distribuível, repartido entre 1º e 4º: 42% / 27% / 18% / 13%
--
-- O 4º deixa de ter valor fixo (era R$ 150) e passa a ter percentual, e o 3º
-- deixa de receber "a diferença".
-- =============================================================================
-- Idempotente: pode rodar mais de uma vez.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Configurações por temporada
-- -----------------------------------------------------------------------------

alter table season_settings
  add column if not exists admin_fee_per_player numeric(12, 2) not null default 60
  check (admin_fee_per_player >= 0);

alter table season_settings
  add column if not exists prize_third_pct numeric(6, 3) not null default 18
  check (prize_third_pct >= 0 and prize_third_pct <= 100);

alter table season_settings
  add column if not exists prize_fourth_pct numeric(6, 3) not null default 13
  check (prize_fourth_pct >= 0 and prize_fourth_pct <= 100);

-- O 4º lugar não tem mais valor fixo.
alter table season_settings drop column if exists prize_fourth_fixed;

-- -----------------------------------------------------------------------------
-- Custos por etapa
-- -----------------------------------------------------------------------------

-- NULL = usa a taxa padrão da temporada. Preenchido = a etapa teve taxa própria.
alter table stages
  add column if not exists admin_fee_per_player numeric(12, 2)
  check (admin_fee_per_player >= 0);

alter table stages
  add column if not exists other_costs numeric(12, 2) not null default 0
  check (other_costs >= 0);

-- -----------------------------------------------------------------------------
-- Valores acordados pela liga
-- -----------------------------------------------------------------------------
-- O filtro por prize_first_pct = 50 (o padrão antigo) faz esta atualização
-- rodar uma vez só: se o admin ajustar os percentuais depois, reaplicar as
-- migrations não sobrescreve o que ele configurou.

update season_settings
set
  buyin = 160,
  admin_fee_per_player = 60,
  prize_first_pct = 42,
  prize_second_pct = 27,
  prize_third_pct = 18,
  prize_fourth_pct = 13
where prize_first_pct = 50;
