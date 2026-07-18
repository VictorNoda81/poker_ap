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

create policy "leitura publica de temporadas"
  on seasons for select to anon, authenticated using (true);

create policy "leitura publica de jogadores"
  on players for select to anon, authenticated using (true);

create policy "leitura publica de etapas"
  on stages for select to anon, authenticated using (true);

create policy "leitura publica de participacoes"
  on stage_entries for select to anon, authenticated using (true);

create policy "leitura publica de configuracoes"
  on season_settings for select to anon, authenticated using (true);

create policy "leitura publica da tabela de pontos"
  on points_table for select to anon, authenticated using (true);

create policy "leitura publica dos convidados da final"
  on final_invitees for select to anon, authenticated using (true);

-- Nenhuma política de INSERT/UPDATE/DELETE é criada de propósito:
-- com RLS ativo e sem política, a escrita fica bloqueada para anon.
