-- ============================================================================
-- Aprovação por tela · Grupo Leh
--
-- A tela de aprovação não pode ler o ClickUp — precisaria de token do ClickUp no
-- navegador. Então o Supabase passa a espelhar em que etapa cada pedido está e de
-- quem ele está esperando, e a tela lê daqui com a chave publishable.
--
-- Pode rodar quantas vezes quiser: tudo é "if not exists" / "or replace".
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) O espelho do estágio, em solicitacoes
-- ---------------------------------------------------------------------------
alter table public.solicitacoes
  add column if not exists card_id         text,
  add column if not exists etapa_atual     text,
  add column if not exists aprovador_atual text,
  add column if not exists decidido_em     timestamptz;

comment on column public.solicitacoes.card_id is
  'Id da tarefa no ClickUp. A tela de aprovação precisa dele para mandar a decisão.';
comment on column public.solicitacoes.etapa_atual is
  'lider | gerencial | financeiro. Nulo quando o pedido não está esperando ninguém.';
comment on column public.solicitacoes.aprovador_atual is
  'aprovadores.id de quem tem a bola agora.';
comment on column public.solicitacoes.decidido_em is
  'Quando saiu da fila. Serve para destacar o que chegou hoje.';

create index if not exists solicitacoes_fila_idx
  on public.solicitacoes (aprovador_atual, etapa_atual)
  where etapa_atual is not null;

-- ---------------------------------------------------------------------------
-- 2) Quem aprova
-- ---------------------------------------------------------------------------
create table if not exists public.aprovadores (
  id            text primary key,
  token         text not null unique,
  nome          text not null,
  email         text,
  slack_user_id text,
  etapas        text[] not null default '{}',
  ativo         boolean not null default true,
  atualizado_em timestamptz not null default now()
);

comment on table public.aprovadores is
  'Quem aprova pedido de compra. O token é o que identifica a fila na URL.';
comment on column public.aprovadores.token is
  'Vai na URL da fila, dentro da DM daquele aprovador. Opaco e por pessoa: quem não recebeu o link não chega na fila de ninguém.';
comment on column public.aprovadores.etapas is
  'Etapas que essa pessoa aprova, ex.: {lider,gerencial}.';

alter table public.aprovadores enable row level security;

-- ---------------------------------------------------------------------------
-- 3) A fila, servida por função e não por leitura direta
--
-- A tabela de aprovadores fica FECHADA para a chave pública. Se a tela lesse a
-- tabela direto, qualquer um listaria todos os tokens e abriria a fila de
-- qualquer aprovador. A função abaixo recebe o token e devolve só a fila dele.
-- ---------------------------------------------------------------------------
create or replace function public.fila_de_aprovacao(p_token text)
returns table (
  id                uuid,
  numero            text,
  card_id           text,
  etapa_atual       text,
  facilitador       text,
  solicitante_nome  text,
  centro_custo      text,
  centro_custo_nome text,
  tipo_compra       text,
  data_necessidade  date,
  motivo            text,
  observacao        text,
  aberto_em         timestamptz,
  total_itens       bigint
)
language sql
security definer
set search_path = public
as $$
  select s.id, s.numero, s.card_id, s.etapa_atual,
         s.facilitador, s.solicitante_nome,
         s.centro_custo, cc.nome as centro_custo_nome,
         s.tipo_compra, s.data_necessidade, s.motivo, s.observacao, s.aberto_em,
         (select count(*) from public.solicitacao_itens i where i.solicitacao_id = s.id)
    from public.solicitacoes s
    join public.aprovadores a
      on a.token = p_token
     and a.ativo
     and s.aprovador_atual = a.id
     and s.etapa_atual = any(a.etapas)
    left join public.centros_custo cc on cc.codigo = s.centro_custo
   where s.etapa_atual is not null
   order by s.aberto_em;
$$;

comment on function public.fila_de_aprovacao(text) is
  'Fila de um aprovador, pelo token. Confere etapa E aprovador: pedido não cai para a pessoa errada.';

-- Quem é o dono do token — para a tela dizer "olá, Fulano" sem expor a tabela.
create or replace function public.aprovador_do_token(p_token text)
returns table (id text, nome text, etapas text[])
language sql
security definer
set search_path = public
as $$
  select a.id, a.nome, a.etapas
    from public.aprovadores a
   where a.token = p_token and a.ativo;
$$;

revoke all on function public.fila_de_aprovacao(text) from public;
revoke all on function public.aprovador_do_token(text) from public;
grant execute on function public.fila_de_aprovacao(text) to anon, authenticated;
grant execute on function public.aprovador_do_token(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Conferência.
-- ---------------------------------------------------------------------------
select (select count(*) from public.aprovadores)                       as aprovadores,
       (select count(*) from public.solicitacoes
         where etapa_atual is not null)                                as na_fila;
