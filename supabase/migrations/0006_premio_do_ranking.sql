-- =============================================================================
-- Divisão do Pote Acumulado: líderes do ranking × mesa da Etapa Final
-- =============================================================================
-- Até aqui, os 10% separados de cada etapa iam INTEIROS para a mesa da Etapa
-- Final. Na prática a liga divide o acumulado em duas partes:
--
--   Pote Acumulado
--     ├─ 50% ... prêmio dos líderes do RANKING da temporada (1º 50% · 2º 30% · 3º 20%)
--     └─ 50% ... entra de fato no pote disputado na mesa da Etapa Final
--
-- Os quatro percentuais são editáveis por temporada, como todo o resto: mudar a
-- regra em 2027 não pode reescrever o que 2026 pagou.
-- =============================================================================
-- Idempotente: pode rodar mais de uma vez.
-- =============================================================================

alter table season_settings
  add column if not exists ranking_share_pct numeric(5, 2) not null default 50
    check (ranking_share_pct >= 0 and ranking_share_pct <= 100),
  add column if not exists ranking_first_pct numeric(5, 2) not null default 50
    check (ranking_first_pct >= 0),
  add column if not exists ranking_second_pct numeric(5, 2) not null default 30
    check (ranking_second_pct >= 0),
  add column if not exists ranking_third_pct numeric(5, 2) not null default 20
    check (ranking_third_pct >= 0);

comment on column season_settings.ranking_share_pct is
  'Quanto do Pote Acumulado vai para os líderes do ranking da temporada. O '
  'restante (100 − este valor) é o pote disputado na mesa da Etapa Final.';

comment on column season_settings.ranking_first_pct is
  'Como a parte dos líderes se divide entre 1º, 2º e 3º do ranking. Se os três '
  'não somarem 100, o app reparte proporcionalmente para não estourar o pote.';

-- O `default` já aplica 50/50/30/20 às temporadas existentes — que é a regra
-- praticada hoje. Nada aqui altera pontos ou prêmios já gravados.
