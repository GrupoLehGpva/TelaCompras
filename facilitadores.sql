-- ============================================================================
-- Facilitadores de compras · Grupo Leh
--
-- Só facilitador abre pedido. Esta tabela é quem diz quem é facilitador — e é
-- daqui que a tela puxa nome e e-mail, pelo usuário do Slack que vem no link do
-- /compras. O e-mail do perfil do Slack não serve: o que interessa para a
-- aprovação achar a liderança é o corporativo, e esse quem controla é a casa.
--
-- Rode este arquivo uma vez para criar a tabela. As linhas entram depois, com a
-- lista de verdade — é o mesmo desenho da carga de centros de custo.
-- ============================================================================

create table if not exists public.facilitadores (
  slack_user_id text primary key,
  nome          text not null,
  email         text not null,
  unidade       text,
  ativo         boolean not null default true,
  atualizado_em timestamptz not null default now()
);

comment on table public.facilitadores is
  'Quem pode abrir pedido de compra. A tela busca pelo slack_user_id que vem no link do /compras.';
comment on column public.facilitadores.slack_user_id is
  'ID do usuário no Slack (U...). É a chave: é o que o /compras manda no link.';
comment on column public.facilitadores.email is
  'E-mail corporativo. É por ele que a 1ª aprovação encontra a liderança.';
comment on column public.facilitadores.ativo is
  'Desligar em vez de apagar: pedido antigo precisa continuar sabendo quem o abriu.';

-- Leitura liberada para a chave pública (a tela lê sem login).
-- Escrita fechada: só pelo editor SQL ou pela chave secreta.
alter table public.facilitadores enable row level security;
drop policy if exists "facilitadores leitura publica" on public.facilitadores;
create policy "facilitadores leitura publica"
  on public.facilitadores for select using (true);

create index if not exists facilitadores_email_idx on public.facilitadores (lower(email));

-- Conferência.
select count(*) filter (where ativo) as ativos, count(*) as total
  from public.facilitadores;
