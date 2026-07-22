-- ===========================================================================
-- Liga de Poker do CAP — todas as migrations, na ordem
--
-- Gerado por: npm run sql  (0001_schema.sql + 0002_rls.sql + 0003_login_attempts.sql + 0004_modelo_financeiro.sql + 0005_reserva_do_historico.sql + 0006_premio_do_ranking.sql)
-- Cole TUDO no SQL Editor do Supabase e clique em Run.
--
-- Pode rodar quantas vezes quiser: as migrations usam guardas de existência,
-- então reaplicar o arquivo inteiro não dá erro nem apaga dado nenhum.
-- ===========================================================================

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


-- =============================================================================
-- Row Level Security
-- =============================================================================
-- Modelo de acesso do app:
--   * Área pública  -> chave anon -> SOMENTE LEITURA (políticas abaixo).
--   * Painel admin  -> chave service_role -> ignora RLS por definição, e só é
--     usada dentro de Server Actions no servidor, atrás da senha do admin.
-- Ou seja: mesmo que a chave anon vaze (ela é pública por natureza, vai no
-- bundle do navegador), ninguém consegue escrever nada.
-- =============================================================================

alter table seasons         enable row level security;
alter table players         enable row level security;
alter table stages          enable row level security;
alter table stage_entries   enable row level security;
alter table season_settings enable row level security;
alter table points_table    enable row level security;
alter table final_invitees  enable row level security;

drop policy if exists "leitura publica de temporadas" on seasons;
create policy "leitura publica de temporadas"
  on seasons for select to anon, authenticated using (true);

drop policy if exists "leitura publica de jogadores" on players;
create policy "leitura publica de jogadores"
  on players for select to anon, authenticated using (true);

drop policy if exists "leitura publica de etapas" on stages;
create policy "leitura publica de etapas"
  on stages for select to anon, authenticated using (true);

drop policy if exists "leitura publica de participacoes" on stage_entries;
create policy "leitura publica de participacoes"
  on stage_entries for select to anon, authenticated using (true);

drop policy if exists "leitura publica de configuracoes" on season_settings;
create policy "leitura publica de configuracoes"
  on season_settings for select to anon, authenticated using (true);

drop policy if exists "leitura publica da tabela de pontos" on points_table;
create policy "leitura publica da tabela de pontos"
  on points_table for select to anon, authenticated using (true);

drop policy if exists "leitura publica dos convidados da final" on final_invitees;
create policy "leitura publica dos convidados da final"
  on final_invitees for select to anon, authenticated using (true);

-- Nenhuma política de INSERT/UPDATE/DELETE é criada de propósito:
-- com RLS ativo e sem política, a escrita fica bloqueada para anon.


-- =============================================================================
-- Limite de tentativas de login no painel de admin
-- =============================================================================
-- Por que no banco e não em memória: a Vercel roda o app em várias instâncias
-- serverless, criadas e destruídas o tempo todo. Um contador em memória seria
-- por instância — quem tentasse várias vezes cairia em processos diferentes e
-- passaria muito além do limite. Contador compartilhado precisa de estado
-- compartilhado.
-- =============================================================================

create table if not exists admin_login_attempts (
  id         uuid primary key default gen_random_uuid(),

  -- HMAC do IP, não o IP em claro. Serve para agrupar tentativas da mesma
  -- origem sem manter um registro de endereços de quem acessou o painel.
  ip_hash    text not null,

  succeeded  boolean not null,
  created_at timestamptz not null default now()
);

-- A consulta quente é "falhas desta origem nos últimos minutos".
create index if not exists admin_login_attempts_lookup
  on admin_login_attempts (ip_hash, created_at desc);

-- Para a limpeza periódica de registros antigos.
create index if not exists admin_login_attempts_created_at
  on admin_login_attempts (created_at);

-- -----------------------------------------------------------------------------
-- Segurança
-- -----------------------------------------------------------------------------
-- RLS ligado e NENHUMA política criada, de propósito: diferente das outras
-- tabelas, esta não é de leitura pública. Só a chave service_role, usada no
-- servidor, enxerga o histórico de tentativas.

alter table admin_login_attempts enable row level security;


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


-- =============================================================================
-- Reserva conhecida do histórico
-- =============================================================================
-- Nas planilhas antigas, a linha "10% DO POTE POR RODADA" é um FATO registrado
-- pela liga, não algo a recalcular: aquele valor já saiu com a taxa de
-- administração e os outros custos deduzidos.
--
-- Recalcular a reserva dessas etapas pela cascata atual mudava números que a
-- liga considera fechados. Por isso o valor passa a ser guardado, e a fórmula
-- só vale para as etapas em que ele não existe (as novas).
-- =============================================================================
-- Idempotente: pode rodar mais de uma vez.
-- =============================================================================

alter table stages
  add column if not exists reserve_override numeric(12, 2)
  check (reserve_override >= 0);

comment on column stages.reserve_override is
  'Reserva da Etapa Final registrada na origem. Quando preenchida, vale sobre a '
  'fórmula — é o caso das etapas importadas das planilhas, cujo pote já vinha '
  'líquido de taxa de administração e outros custos.';


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
