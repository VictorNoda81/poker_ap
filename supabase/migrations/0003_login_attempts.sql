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
