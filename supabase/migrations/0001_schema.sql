-- =============================================================================
-- Liga de Poker do Clube Alto de Pinheiros — esquema inicial
-- =============================================================================
-- Convenções:
--   * Dinheiro em numeric(12,2) — nunca float, para não acumular erro de
--     arredondamento na premiação.
--   * Percentuais guardados em pontos percentuais (10 = 10%), não em fração.
--   * Cadastro de jogadores é GLOBAL: o mesmo jogador atravessa temporadas.
--   * Configurações (pontos, buy-in, premiação) são POR TEMPORADA, para que
--     mexer nas regras de 2027 não reescreva o histórico de 2026.
-- =============================================================================
-- Esta migration pode ser executada mais de uma vez sem erro: tipos, tabelas e
-- índices usam guardas de existência, e triggers/políticas são recriados. Isso
-- evita o "already exists" de quem reaplica o arquivo por engano.
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------

-- 'indefinido' é o estado inicial dos jogadores importados da planilha, que não
-- trazia a informação de sócio/convidado. O admin classifica depois.
do $$ begin
  create type player_type as enum ('socio', 'convidado', 'indefinido');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type stage_status as enum ('scheduled', 'completed');
exception when duplicate_object then null;
end $$;

-- 'auto' = entrou na lista da Final por estar entre os N primeiros do ranking.
-- 'manual' = o admin convidou explicitamente (substituto de quem não pôde ir).
do $$ begin
  create type invitee_source as enum ('auto', 'manual');
exception when duplicate_object then null;
end $$;

-- -----------------------------------------------------------------------------
-- Temporadas
-- -----------------------------------------------------------------------------

create table if not exists seasons (
  id          uuid primary key default gen_random_uuid(),
  year        integer not null unique,
  name        text not null,
  is_current  boolean not null default false,
  created_at  timestamptz not null default now()
);

-- No máximo uma temporada marcada como atual (índice parcial).
create unique index if not exists seasons_single_current on seasons (is_current) where is_current;

-- -----------------------------------------------------------------------------
-- Jogadores (globais)
-- -----------------------------------------------------------------------------

create table if not exists players (
  id               uuid primary key default gen_random_uuid(),
  full_name        text not null,
  type             player_type not null default 'indefinido',
  -- Só faz sentido para sócios.
  member_number    text,
  -- Só faz sentido para convidados: quem do clube trouxe a pessoa.
  invited_by_name  text,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint players_full_name_not_blank check (btrim(full_name) <> ''),
  constraint players_member_number_only_socio
    check (member_number is null or type = 'socio'),
  constraint players_invited_by_only_convidado
    check (invited_by_name is null or type = 'convidado')
);

-- Nome é a chave natural usada pelo seed (a planilha só tem nomes), então
-- precisa ser único ignorando maiúsculas/minúsculas e espaços nas pontas.
create unique index if not exists players_unique_name on players (lower(btrim(full_name)));

-- -----------------------------------------------------------------------------
-- Etapas
-- -----------------------------------------------------------------------------

create table if not exists stages (
  id                uuid primary key default gen_random_uuid(),
  season_id         uuid not null references seasons (id) on delete cascade,
  -- Numeração dentro da temporada. O nome exibido ("Etapa 7 - Jul/26") é
  -- derivado de number + event_date na aplicação, nunca armazenado.
  number            integer not null check (number >= 1),
  event_date        date not null,
  -- A Etapa Final distribui a reserva acumulada da temporada.
  is_final          boolean not null default false,
  -- Etapa que fecha o corte para definir os convidados da Final (Outubro).
  is_october_cutoff boolean not null default false,
  status            stage_status not null default 'scheduled',
  -- Arrecadação total informada manualmente. Existe para as etapas importadas
  -- da planilha, onde o total do pote é conhecido mas não há o detalhe por
  -- jogador. Quando NULL, a arrecadação é SUM(stage_entries.amount_paid).
  gross_amount_override numeric(12, 2) check (gross_amount_override >= 0),
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  unique (season_id, number)
);

create unique index if not exists stages_single_final  on stages (season_id) where is_final;
create unique index if not exists stages_single_cutoff on stages (season_id) where is_october_cutoff;
create index if not exists stages_by_season on stages (season_id, event_date);

-- -----------------------------------------------------------------------------
-- Participações / resultados
-- -----------------------------------------------------------------------------

create table if not exists stage_entries (
  id            uuid primary key default gen_random_uuid(),
  stage_id      uuid not null references stages (id) on delete cascade,
  player_id     uuid not null references players (id) on delete restrict,

  -- A EXISTÊNCIA da linha significa "participou desta etapa".
  -- placement NULL = participou, mas a colocação exata não foi registrada
  -- (caso típico do 16º ou pior, que pontua igual independente da posição).
  -- Colocações nulas ficam de fora da média de classificação do jogador.
  placement     integer check (placement >= 1),

  -- Pontos efetivamente creditados. Gravado (não calculado on-the-fly) para
  -- que alterar a tabela de pontuação no futuro não reescreva o passado.
  points        integer not null default 0 check (points >= 0),

  -- Quanto o jogador GASTOU na etapa (buy-in + re-buys + add-on).
  -- NULL = ainda não informado (etapas importadas da planilha).
  amount_paid   numeric(12, 2) check (amount_paid >= 0),
  -- Auxiliares opcionais que alimentam a sugestão de amount_paid.
  rebuys        integer check (rebuys >= 0),
  had_addon     boolean,

  -- Quanto o jogador RECEBEU de premiação nesta etapa.
  prize_amount  numeric(12, 2) not null default 0 check (prize_amount >= 0),

  -- Marcado pelo seed quando a planilha trouxe dado ambíguo (ex.: dois
  -- jogadores com a mesma pontuação de colocação exclusiva na mesma etapa).
  needs_review  boolean not null default false,
  review_note   text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (stage_id, player_id)
);

create index if not exists stage_entries_by_stage  on stage_entries (stage_id);
create index if not exists stage_entries_by_player on stage_entries (player_id);

-- -----------------------------------------------------------------------------
-- Configurações por temporada
-- -----------------------------------------------------------------------------

create table if not exists season_settings (
  season_id           uuid primary key references seasons (id) on delete cascade,

  -- Valores financeiros padrão para novas etapas.
  buyin               numeric(12, 2) not null default 150 check (buyin >= 0),
  rebuy               numeric(12, 2) not null default 100 check (rebuy >= 0),
  addon               numeric(12, 2) not null default 150 check (addon >= 0),

  -- Percentual da arrecadação de cada etapa reservado para a Etapa Final.
  final_reserve_pct   numeric(6, 3) not null default 10
                      check (final_reserve_pct >= 0 and final_reserve_pct <= 100),

  -- Premiação padrão, aplicada sobre a arrecadação JÁ DESCONTADA a reserva.
  -- O 3º lugar recebe a diferença (o que sobra após 1º, 2º e 4º), por isso não
  -- tem coluna própria.
  prize_first_pct     numeric(6, 3) not null default 50
                      check (prize_first_pct >= 0 and prize_first_pct <= 100),
  prize_second_pct    numeric(6, 3) not null default 30
                      check (prize_second_pct >= 0 and prize_second_pct <= 100),
  prize_fourth_fixed  numeric(12, 2) not null default 150
                      check (prize_fourth_fixed >= 0),

  -- Pontos de quem termina em 16º ou pior.
  points_below_cutoff integer not null default 5 check (points_below_cutoff >= 0),

  -- Quantos primeiros do ranking são convidados automaticamente para a Final.
  final_invite_count  integer not null default 20 check (final_invite_count >= 0),

  updated_at          timestamptz not null default now()
);

-- Tabela de pontuação por colocação (1 a 15 no padrão da liga).
-- Colocações não listadas caem em season_settings.points_below_cutoff.
create table if not exists points_table (
  season_id  uuid not null references seasons (id) on delete cascade,
  placement  integer not null check (placement >= 1),
  points     integer not null check (points >= 0),
  primary key (season_id, placement)
);

-- -----------------------------------------------------------------------------
-- Lista de convidados da Etapa Final
-- -----------------------------------------------------------------------------

create table if not exists final_invitees (
  stage_id   uuid not null references stages (id) on delete cascade,
  player_id  uuid not null references players (id) on delete cascade,
  source     invitee_source not null default 'auto',
  -- Posição no ranking no momento em que a lista foi montada (referência).
  rank_at_invite integer,
  created_at timestamptz not null default now(),
  primary key (stage_id, player_id)
);

-- -----------------------------------------------------------------------------
-- updated_at automático
-- -----------------------------------------------------------------------------

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists players_touch on players;
create trigger players_touch        before update on players
  for each row execute function set_updated_at();
drop trigger if exists stages_touch on stages;
create trigger stages_touch         before update on stages
  for each row execute function set_updated_at();
drop trigger if exists stage_entries_touch on stage_entries;
create trigger stage_entries_touch  before update on stage_entries
  for each row execute function set_updated_at();
drop trigger if exists season_settings_touch on season_settings;
create trigger season_settings_touch before update on season_settings
  for each row execute function set_updated_at();
