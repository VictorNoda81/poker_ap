-- =============================================================================
-- Preferências globais do app (uma linha só)
-- =============================================================================
-- Diferente de `season_settings`, que é por temporada, aqui moram as opções que
-- valem para o site inteiro. A primeira é se as informações financeiras por
-- jogador — quanto pagou, saldo e ROI — aparecem na área pública.
--
-- O PRÊMIO de cada jogador continua sempre visível: é o que ele ganhou, não
-- revela quanto gastou. A opção esconde só o custo, o saldo e o ROI.
--
-- `id` fixo em 1 com CHECK garante que exista no máximo uma linha — o app lê
-- sempre `where id = 1` e nunca precisa lidar com "qual das configurações".
-- =============================================================================
-- Idempotente: pode rodar mais de uma vez.
-- =============================================================================

create table if not exists app_settings (
  id smallint primary key default 1 check (id = 1),
  show_player_finances boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into app_settings (id) values (1) on conflict (id) do nothing;

alter table app_settings enable row level security;

drop policy if exists "leitura publica das preferencias" on app_settings;
create policy "leitura publica das preferencias"
  on app_settings for select to anon, authenticated using (true);
-- Sem política de escrita: só o service_role (painel admin) grava.
