-- ============================================================================
-- CAMINHO DAS TELAS · 1/3 · ESQUEMA
--
-- Só adição. Nada do que o caminho do ClickUp lê ou grava muda de forma:
--   · colunas novas em solicitacoes, todas com valor padrão que descreve o
--     que já existe (canal = 'clickup', versao = 1);
--   · token novo em compradores (a tabela não é lida pela chave pública);
--   · tabelas novas, fechadas à chave pública (RLS sem política + revoke).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- solicitacoes: canal, versão e relógio da etapa
-- ---------------------------------------------------------------------------
alter table public.solicitacoes
  add column if not exists canal text not null default 'clickup',
  add column if not exists versao integer not null default 1,
  add column if not exists entrou_na_etapa_em timestamptz,
  add column if not exists em_edicao_desde timestamptz,
  add column if not exists edicao_usada boolean not null default false,
  add column if not exists cancelado_em timestamptz;

do $$ begin
  alter table public.solicitacoes
    add constraint solicitacoes_canal_check check (canal in ('clickup', 'telas'));
exception when duplicate_object then null; end $$;

comment on column public.solicitacoes.canal is
  'Por onde o pedido anda: clickup (card + n8n, caminho antigo) ou telas (só telas e botões). Nasce num canal e termina nele.';
comment on column public.solicitacoes.versao is
  'Sobe a cada gravação feita pelo caminho das telas. Quem decide manda a versão que viu; se mudou, o banco recusa.';
comment on column public.solicitacoes.em_edicao_desde is
  'Preenchido enquanto o facilitador edita. Passados 30 minutos a edição é descartada e o pedido volta à liderança.';
comment on column public.solicitacoes.edicao_usada is
  'O facilitador edita uma vez só. Vira true quando uma edição é SALVA (desistir ou deixar vencer não gasta).';

create index if not exists ix_solicitacoes_canal_etapa
  on public.solicitacoes (canal, etapa_atual);

-- ---------------------------------------------------------------------------
-- compradores: credencial da Mesa de Cotação (mesmo modelo dos aprovadores)
-- ---------------------------------------------------------------------------
alter table public.compradores
  add column if not exists token text;

update public.compradores
   set token = 'cp-' || replace(gen_random_uuid()::text, '-', '')
 where token is null;

alter table public.compradores alter column token set not null;
alter table public.compradores
  alter column token set default ('cp-' || replace(gen_random_uuid()::text, '-', ''));

do $$ begin
  alter table public.compradores add constraint compradores_token_key unique (token);
exception when duplicate_object or duplicate_table then null; end $$;

-- ---------------------------------------------------------------------------
-- movimentos_compra: a linha do tempo do caminho das telas, e a fila de avisos
--
-- Uma linha por coisa que aconteceu. É o histórico (quem, quando, por quê, o
-- que mudou) e, quando `avisar` é true, também o pedido de aviso no Slack que
-- o n8n vai buscar. Aviso fora do caminho da decisão: se o Slack cair, a
-- decisão já está gravada e o aviso sai depois.
--
-- `decisoes` continua existindo e continua sendo gravada (última decisão por
-- etapa), porque as telas e o painel de hoje leem de lá. Mas ela tem uma
-- decisão por etapa e só aprovado/reprovado; devolução e segunda rodada de
-- aprovação só cabem aqui.
-- ---------------------------------------------------------------------------
create table if not exists public.movimentos_compra (
  id              bigint generated always as identity primary key,
  solicitacao_id  uuid not null references public.solicitacoes(id) on delete cascade,
  numero          text not null,
  acao            text not null check (acao in (
                    'criado', 'edicao_iniciada', 'edicao_salva', 'edicao_desistida',
                    'edicao_expirada', 'cancelado', 'aprovado', 'reprovado',
                    'devolvido', 'cotacao_salva', 'cotacao_enviada')),
  etapa           text,
  etapa_seguinte  text,
  quem_tipo       text not null check (quem_tipo in ('facilitador', 'aprovador', 'comprador', 'sistema')),
  quem_id         text,
  quem_nome       text,
  motivo          text,
  detalhe         jsonb not null default '{}'::jsonb,
  versao          integer,
  em              timestamptz not null default now(),
  -- aviso no Slack
  avisar          boolean not null default false,
  avisado_em      timestamptz,
  aviso_tentativas integer not null default 0,
  aviso_erro      text
);

create index if not exists ix_movimentos_solicitacao on public.movimentos_compra (solicitacao_id, em);
create index if not exists ix_movimentos_aviso_pendente on public.movimentos_compra (id)
  where avisar and avisado_em is null;

-- ---------------------------------------------------------------------------
-- Mapa de cotação (a Mesa)
--
-- Tabelas próprias, e não `cotacoes`/`cotacao_precos`: aquelas servem ao
-- portal do fornecedor (token por fornecedor, um fornecedor por solicitação,
-- condição de pagamento em lista fechada). A Mesa tem fornecedor POR FAMÍLIA,
-- três colunas fixas, frete/prazo/condição por fornecedor em cada família e
-- escolha por item. Espremer isso nas tabelas do portal quebraria as travas
-- delas ou as do mapa.
-- ---------------------------------------------------------------------------
create table if not exists public.mapa_cotacao (
  solicitacao_id  uuid primary key references public.solicitacoes(id) on delete cascade,
  estado          text not null default 'rascunho'
                  check (estado in ('rascunho', 'enviada', 'devolvida')),
  observacao      text,
  total           numeric,
  versao          integer not null default 1,
  atualizado_em   timestamptz not null default now(),
  atualizado_por  text,
  enviada_em      timestamptz,
  enviada_por     text,
  envios          integer not null default 0
);

create table if not exists public.mapa_fornecedores (
  solicitacao_id  uuid not null references public.mapa_cotacao(solicitacao_id) on delete cascade,
  familia         text not null,
  coluna          smallint not null check (coluna between 1 and 3),
  fornecedor_id   text references public.fornecedores(id),
  fornecedor_nome text,
  desconto_pct    numeric check (desconto_pct is null or (desconto_pct >= 0 and desconto_pct <= 100)),
  frete           numeric check (frete is null or frete >= 0),
  prazo_dias      integer check (prazo_dias is null or prazo_dias >= 0),
  condicao        text,
  primary key (solicitacao_id, familia, coluna)
);

create table if not exists public.mapa_precos (
  item_id         uuid not null references public.solicitacao_itens(id) on delete cascade,
  coluna          smallint not null check (coluna between 1 and 3),
  solicitacao_id  uuid not null references public.mapa_cotacao(solicitacao_id) on delete cascade,
  preco_unitario  numeric not null check (preco_unitario > 0),
  primary key (item_id, coluna)
);

create table if not exists public.mapa_escolhas (
  item_id         uuid primary key references public.solicitacao_itens(id) on delete cascade,
  solicitacao_id  uuid not null references public.mapa_cotacao(solicitacao_id) on delete cascade,
  coluna          smallint not null check (coluna between 1 and 3)
);

create index if not exists ix_mapa_precos_sol on public.mapa_precos (solicitacao_id);
create index if not exists ix_mapa_escolhas_sol on public.mapa_escolhas (solicitacao_id);

-- ---------------------------------------------------------------------------
-- Fechadas à chave pública. Tudo passa por função.
-- ---------------------------------------------------------------------------
alter table public.movimentos_compra enable row level security;
alter table public.mapa_cotacao      enable row level security;
alter table public.mapa_fornecedores enable row level security;
alter table public.mapa_precos       enable row level security;
alter table public.mapa_escolhas     enable row level security;

revoke all on public.movimentos_compra, public.mapa_cotacao, public.mapa_fornecedores,
              public.mapa_precos, public.mapa_escolhas
  from anon, authenticated;
-- ============================================================================
-- CAMINHO DAS TELAS · 2/3 · FUNÇÕES DE APOIO (internas, fora da chave pública)
-- ============================================================================

-- Prazo da edição do facilitador. Um lugar só: mudar aqui muda tudo.
create or replace function public._telas_prazo_edicao()
returns interval language sql immutable as $$ select interval '30 minutes' $$;

-- Erro de regra: código curto para a tela decidir, mensagem pronta para mostrar.
create or replace function public._telas_erro(p_codigo text, p_mensagem text)
returns void language plpgsql as $$
begin
  raise exception using errcode = 'P0001', message = p_codigo, hint = p_mensagem;
end $$;

-- Família do item: a do catálogo; item fora do catálogo cai em 'FORA'.
create or replace function public._telas_familia(p_codigo text)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select nullif(trim(ci.familia), '') from catalogo_itens ci
                    where ci.codigo = p_codigo limit 1), 'FORA');
$$;

-- Quem aprova numa etapa, para um facilitador.
create or replace function public._telas_aprovador_da_etapa(p_facilitador text, p_etapa text)
returns text language sql stable security definer set search_path = public as $$
  select case p_etapa
           when 'lider'      then f.superior_id
           when 'gerencial'  then f.gerente_id
           when 'financeiro' then f.financeiro_id
         end
    from facilitadores f where f.id = p_facilitador;
$$;

-- Para onde vai o pedido quando a cotação é enviada.
--   mensal: financeiro (a gerencial já aprovou a necessidade antes da cotação)
--   normal/urgente: gerencial; se quem pediu é o aprovador financeiro, a
--   gerencial não se aplica e vai direto ao financeiro (mesma regra do
--   entrou_em_etapa do caminho do ClickUp).
create or replace function public._telas_etapa_apos_cotacao(p_tipo text, p_facilitador text)
returns text language sql stable security definer set search_path = public as $$
  select case
           when fluxo_da_compra(p_tipo) = 'mensal'                 then 'financeiro'
           when papel_do_solicitante(p_facilitador) = 'financeiro' then 'financeiro'
           else 'gerencial'
         end;
$$;

-- Registra um movimento (histórico + pedido de aviso).
-- p_para: [{"papel":"aprovador|facilitador|comprador","id":"..."}]
create or replace function public._telas_mov(
  p_sol uuid, p_acao text, p_etapa text, p_etapa_seguinte text,
  p_quem_tipo text, p_quem_id text, p_quem_nome text,
  p_motivo text default null, p_detalhe jsonb default '{}'::jsonb,
  p_para jsonb default '[]'::jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint; s solicitacoes%rowtype;
begin
  select * into s from solicitacoes where id = p_sol;
  insert into movimentos_compra (solicitacao_id, numero, acao, etapa, etapa_seguinte,
         quem_tipo, quem_id, quem_nome, motivo, detalhe, versao, avisar)
  values (s.id, s.numero, p_acao, p_etapa, p_etapa_seguinte,
          p_quem_tipo, p_quem_id, p_quem_nome, nullif(trim(p_motivo), ''),
          coalesce(p_detalhe, '{}'::jsonb) || jsonb_build_object('para', coalesce(p_para, '[]'::jsonb)),
          s.versao, jsonb_array_length(coalesce(p_para, '[]'::jsonb)) > 0)
  returning id into v_id;
  return v_id;
end $$;

-- Move o pedido: etapa, aprovador, status; zera o relógio da etapa e sobe a versão.
create or replace function public._telas_mover(p_sol uuid, p_etapa text, p_aprovador text, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update solicitacoes
     set etapa_atual        = p_etapa,
         aprovador_atual    = p_aprovador,
         status             = p_status,
         entrou_na_etapa_em = now(),
         decidido_em        = case when p_etapa is null then now() else null end,
         versao             = versao + 1
   where id = p_sol;
end $$;

-- Descarta a edição vencida de UM pedido (já travado por quem chamou).
-- Devolve true se descartou.
create or replace function public._telas_expirar_um(p_sol uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare s solicitacoes%rowtype; f facilitadores%rowtype;
begin
  select * into s from solicitacoes where id = p_sol;
  if s.etapa_atual is distinct from 'edicao'
     or s.em_edicao_desde is null
     or s.em_edicao_desde > now() - _telas_prazo_edicao() then
    return false;
  end if;

  select * into f from facilitadores where id = s.facilitador_id;
  update solicitacoes set em_edicao_desde = null where id = s.id;
  perform _telas_mover(s.id, 'lider', s.aprovador_atual, 'aguardando aprovacao');
  perform _telas_mov(s.id, 'edicao_expirada', 'edicao', 'lider', 'sistema', null, 'Sistema',
    null,
    jsonb_build_object('iniciada_em', s.em_edicao_desde,
                       'prazo_minutos', extract(epoch from _telas_prazo_edicao()) / 60),
    jsonb_build_array(jsonb_build_object('papel', 'facilitador', 'id', f.id)));
  return true;
end $$;

-- Descarta todas as edições vencidas. É o que o agendamento do n8n chama.
create or replace function public.liberar_edicoes_vencidas()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; lista jsonb := '[]'::jsonb;
begin
  for r in select id, numero from solicitacoes
            where canal = 'telas' and etapa_atual = 'edicao'
              and em_edicao_desde <= now() - _telas_prazo_edicao()
            for update skip locked
  loop
    if _telas_expirar_um(r.id) then
      n := n + 1; lista := lista || to_jsonb(r.numero);
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'liberadas', n, 'numeros', lista);
end $$;

-- Quem é o dono deste token? Um lugar só para as quatro credenciais.
create or replace function public._telas_quem(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(
    (select jsonb_build_object('tipo', 'facilitador', 'id', f.id, 'nome', f.nome)
       from facilitadores f where f.token = p_token and f.ativo),
    (select jsonb_build_object('tipo', 'aprovador', 'id', a.id, 'nome', a.nome, 'etapas', to_jsonb(a.etapas))
       from aprovadores a where a.token = p_token and a.ativo),
    (select jsonb_build_object('tipo', 'comprador', 'id', c.id, 'nome', c.nome)
       from compradores c where c.token = p_token and c.ativo),
    (select jsonb_build_object('tipo', 'diretoria', 'id', null, 'nome', p.nome)
       from painel_acesso p where p.token = p_token and p.ativo)
  )
  where coalesce(trim(p_token), '') <> '';
$$;

-- Texto de situação, igual para todas as telas.
create or replace function public._telas_situacao(p_status text, p_etapa text)
returns text language sql immutable as $$
  select case
    when p_status = 'reprovado'        then 'Reprovado'
    when p_status = 'cancelado'        then 'Cancelado'
    when p_status = 'aprovado'         then 'Aprovado — ordem de compra'
    when p_etapa  = 'lider'            then 'Esperando a liderança'
    when p_etapa  = 'edicao'           then 'Em edição pelo facilitador'
    when p_etapa  = 'cotacao'          then 'Em cotação'
    when p_etapa  = 'gerencial'        then 'Esperando a aprovação gerencial'
    when p_etapa  = 'financeiro'       then 'Esperando a aprovação financeira'
    else 'Encerrado'
  end;
$$;

-- Internas: ninguém de fora chama.
revoke execute on function
  public._telas_prazo_edicao(), public._telas_erro(text, text), public._telas_familia(text),
  public._telas_aprovador_da_etapa(text, text), public._telas_etapa_apos_cotacao(text, text),
  public._telas_mov(uuid, text, text, text, text, text, text, text, jsonb, jsonb),
  public._telas_mover(uuid, text, text, text), public._telas_expirar_um(uuid),
  public.liberar_edicoes_vencidas(), public._telas_quem(text), public._telas_situacao(text, text)
  from public, anon, authenticated;
-- ============================================================================
-- CAMINHO DAS TELAS · 3a · FACILITADOR (abrir, editar uma vez, cancelar, listar)
-- ============================================================================

-- Campos que o facilitador escreve. O resto (quem é, e-mail, Slack) vem do
-- cadastro pelo token, nunca da tela.
create or replace function public._telas_validar_cabecalho(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_tipo text := lower(nullif(trim(p->>'tipo_compra'), ''));
        v_def  text := lower(nullif(trim(p->>'definicao_fornecedor'), ''));
        v_cc   text := nullif(trim(p->>'centro_custo'), '');
        v_emp  text := nullif(trim(p->>'empresa_id'), '');
        v_data text := nullif(trim(p->>'data_necessidade'), '');
begin
  if v_tipo is null or v_tipo not in ('normal', 'urgente', 'mensal') then
    perform _telas_erro('tipo_invalido', 'Escolha o tipo de compra: normal, urgente ou mensal.');
  end if;
  if v_def is null or v_def not in ('cotacao', 'unico') then
    perform _telas_erro('definicao_invalida', 'Escolha entre cotação e fornecedor único.');
  end if;
  if v_def = 'unico' and nullif(trim(p->>'justificativa_fornecedor'), '') is null then
    perform _telas_erro('sem_justificativa', 'Fornecedor único exige justificativa.');
  end if;
  if v_cc is null or not exists (select 1 from centros_custo where codigo = v_cc and ativo) then
    perform _telas_erro('centro_custo_invalido', 'Centro de custo não encontrado na lista.');
  end if;
  if v_emp is not null and not exists (select 1 from empresas where id = v_emp and ativo) then
    perform _telas_erro('empresa_invalida', 'Empresa não encontrada na lista.');
  end if;
  if v_data is not null then
    begin
      perform v_data::date;
    exception when others then
      perform _telas_erro('data_invalida', 'Data de necessidade inválida.');
    end;
  end if;
  if nullif(trim(p->>'motivo'), '') is null then
    perform _telas_erro('sem_motivo', 'Diga para que é a compra.');
  end if;
end $$;

create or replace function public._telas_validar_itens(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare i jsonb; n int := 0; q numeric;
begin
  if p is null or jsonb_typeof(p) <> 'array' then
    perform _telas_erro('sem_itens', 'O pedido precisa de pelo menos um item.');
  end if;
  for i in select * from jsonb_array_elements(p) loop
    if nullif(trim(i->>'descricao'), '') is null then
      perform _telas_erro('item_sem_descricao', 'Todo item precisa de descrição.');
    end if;
    begin
      q := (i->>'quantidade')::numeric;
    exception when others then
      perform _telas_erro('quantidade_invalida', 'Quantidade inválida no item "' || (i->>'descricao') || '".');
    end;
    if q is null or q <= 0 then
      perform _telas_erro('quantidade_invalida', 'Quantidade precisa ser maior que zero no item "' || (i->>'descricao') || '".');
    end if;
    n := n + 1;
  end loop;
  if n = 0 then
    perform _telas_erro('sem_itens', 'O pedido precisa de pelo menos um item.');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Abrir um pedido pelo caminho das telas (sem card)
-- ---------------------------------------------------------------------------
create or replace function public.abrir_pedido_telas(p_token text, p_cabecalho jsonb, p_itens jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_cod text; v_msg text;
  f facilitadores%rowtype; a aprovadores%rowtype;
  v_cab jsonb; r jsonb; v_ini jsonb; v_etapa text; v_aprov text; v_id uuid; v_status text;
  v_para jsonb;
begin
  begin
    select * into f from facilitadores where token = p_token and ativo;
    if f.id is null then
      perform _telas_erro('token_invalido', 'Este link não vale mais. Peça um novo com /compras no Slack.');
    end if;

    perform _telas_validar_cabecalho(p_cabecalho);
    perform _telas_validar_itens(p_itens);

    -- Quem pede vem do cadastro. Da tela, só o conteúdo do pedido.
    v_cab := jsonb_build_object(
      'solicitante',              f.nome,
      'facilitador',              f.nome,
      'facilitador_email',        f.email,
      'slack_user_id',            f.slack_user_id,
      'solicitante_nome',         p_cabecalho->>'solicitante_nome',
      'observacao',               p_cabecalho->>'observacao',
      'empresa_id',               p_cabecalho->>'empresa_id',
      'centro_custo',             p_cabecalho->>'centro_custo',
      'unidade_destino',          p_cabecalho->>'unidade_destino',
      'local_entrega',            p_cabecalho->>'local_entrega',
      'tipo_compra',              lower(trim(p_cabecalho->>'tipo_compra')),
      'definicao_fornecedor',     lower(trim(p_cabecalho->>'definicao_fornecedor')),
      'justificativa_fornecedor', case when lower(trim(p_cabecalho->>'definicao_fornecedor')) = 'unico'
                                       then p_cabecalho->>'justificativa_fornecedor' end,
      'data_necessidade',         p_cabecalho->>'data_necessidade',
      'prioridade',               case when lower(trim(p_cabecalho->>'tipo_compra')) = 'urgente'
                                       then 'urgente' else 'normal' end,
      'motivo',                   p_cabecalho->>'motivo',
      'status',                   'aguardando aprovacao');

    r := criar_solicitacao(v_cab, p_itens, false);
    if coalesce((r->>'ok')::boolean, false) is not true then
      perform _telas_erro(coalesce(r->>'erro', 'falha_ao_gravar'),
                          coalesce(r->>'mensagem', 'Não foi possível gravar o pedido.'));
    end if;
    v_id := (r->>'id')::uuid;

    v_ini   := etapa_inicial(f.id, v_cab->>'tipo_compra');
    v_etapa := v_ini->>'etapa';

    if v_etapa in ('lider', 'gerencial') then
      v_aprov := _telas_aprovador_da_etapa(f.id, v_etapa);
      select * into a from aprovadores where id = v_aprov and ativo;
      if a.id is null then
        perform _telas_erro('aprovador_sem_cadastro',
          'Não há aprovador cadastrado para a etapa ' || v_etapa || ' de ' || f.nome || '. Avise Compras.');
      end if;
      v_status := 'aguardando aprovacao';
      v_para := jsonb_build_array(jsonb_build_object('papel', 'aprovador', 'id', a.id),
                                  jsonb_build_object('papel', 'facilitador', 'id', f.id));
    else
      v_aprov := null;
      v_status := 'em cotacao';
      v_para := jsonb_build_array(jsonb_build_object('papel', 'comprador', 'id', f.comprador_id),
                                  jsonb_build_object('papel', 'facilitador', 'id', f.id));
    end if;

    update solicitacoes
       set canal = 'telas', facilitador_id = f.id,
           etapa_atual = v_etapa, aprovador_atual = v_aprov, status = v_status,
           entrou_na_etapa_em = now(), versao = 1
     where id = v_id;

    perform _telas_mov(v_id, 'criado', null, v_etapa, 'facilitador', f.id, f.nome, null,
      jsonb_build_object('pulou', (v_ini->>'pulou')::boolean, 'motivo_do_pulo', v_ini->>'motivo',
                         'tipo_compra', v_cab->>'tipo_compra', 'itens', r->'itens'),
      v_para);

    return jsonb_build_object('ok', true, 'id', v_id, 'numero', r->>'numero',
      'etapa', v_etapa, 'situacao', _telas_situacao(v_status, v_etapa),
      'com_quem', coalesce(a.nome, 'Compras'), 'itens', r->'itens');
  exception
    when sqlstate 'P0001' then
      get stacked diagnostics v_cod = message_text, v_msg = pg_exception_hint;
      return jsonb_build_object('ok', false, 'erro', v_cod, 'mensagem', v_msg);
    when check_violation or invalid_text_representation or numeric_value_out_of_range
         or invalid_datetime_format or datetime_field_overflow then
      return jsonb_build_object('ok', false, 'erro', 'valor_invalido',
        'mensagem', 'Algum valor não está no formato certo: ' || sqlerrm);
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Meus pedidos (facilitador) — os dois canais, com o que ele pode fazer em cada
-- ---------------------------------------------------------------------------
create or replace function public.meus_pedidos(p_token text, p_limite integer default 100)
returns jsonb language plpgsql security definer set search_path = public as $$
declare f facilitadores%rowtype; r record; v jsonb;
begin
  select * into f from facilitadores where token = p_token and ativo;
  if f.id is null then
    return jsonb_build_object('ok', false, 'erro', 'token_invalido',
      'mensagem', 'Este link não vale mais. Peça um novo com /compras no Slack.');
  end if;

  -- Edição vencida deste facilitador sai antes de mostrar a lista.
  for r in select id from solicitacoes
            where facilitador_id = f.id and canal = 'telas' and etapa_atual = 'edicao'
              and em_edicao_desde <= now() - _telas_prazo_edicao()
            for update skip locked
  loop perform _telas_expirar_um(r.id); end loop;

  select coalesce(jsonb_agg(x order by (x->>'encerrado')::boolean, x->>'aberto_em' desc), '[]'::jsonb)
    into v
  from (
    select jsonb_build_object(
      'id', s.id, 'numero', s.numero, 'canal', s.canal, 'versao', s.versao,
      'assunto', coalesce(s.motivo, 'Solicitação de compra'),
      'tipo_compra', s.tipo_compra, 'centro_custo_nome', cc.nome,
      'total_itens', (select count(*) from solicitacao_itens i where i.solicitacao_id = s.id),
      'aberto_em', s.aberto_em, 'data_necessidade', s.data_necessidade,
      'etapa_atual', s.etapa_atual, 'status', s.status,
      'situacao', _telas_situacao(s.status, s.etapa_atual),
      'com_quem', case when s.etapa_atual in ('lider','gerencial','financeiro') then ap.nome
                       when s.etapa_atual = 'cotacao' then 'Compras'
                       when s.etapa_atual = 'edicao' then 'você' end,
      'desde', coalesce(s.entrou_na_etapa_em, s.aberto_em),
      'encerrado', (s.etapa_atual is null),
      'em_edicao', (s.etapa_atual = 'edicao'),
      'edicao_expira_em', case when s.etapa_atual = 'edicao'
                               then s.em_edicao_desde + _telas_prazo_edicao() end,
      'edicao_usada', s.edicao_usada,
      'pode_editar',   (s.canal = 'telas' and s.etapa_atual = 'lider' and not s.edicao_usada),
      'pode_cancelar', (s.canal = 'telas' and s.etapa_atual in ('lider', 'edicao'))
    ) as x
    from solicitacoes s
    left join centros_custo cc on cc.codigo = s.centro_custo
    left join aprovadores ap on ap.id = s.aprovador_atual
    where s.facilitador_id = f.id
      and s.status is distinct from 'encerrado (teste)'
    order by s.aberto_em desc
    limit greatest(1, least(coalesce(p_limite, 100), 300))
  ) t;

  return jsonb_build_object('ok', true, 'facilitador', f.nome, 'pedidos', v,
    'prazo_edicao_minutos', extract(epoch from _telas_prazo_edicao()) / 60);
end $$;

-- ---------------------------------------------------------------------------
-- Editar (uma vez só): iniciar, salvar, desistir
-- ---------------------------------------------------------------------------
create or replace function public.iniciar_edicao(p_token text, p_id uuid, p_versao integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_cod text; v_msg text; f facilitadores%rowtype; s solicitacoes%rowtype;
begin
  begin
    select * into f from facilitadores where token = p_token and ativo;
    if f.id is null then
      perform _telas_erro('token_invalido', 'Este link não vale mais. Peça um novo com /compras no Slack.');
    end if;

    select * into s from solicitacoes where id = p_id for update;
    if s.id is null or s.facilitador_id is distinct from f.id then
      perform _telas_erro('nao_encontrado', 'Pedido não encontrado entre os seus.');
    end if;
    if s.canal <> 'telas' then
      perform _telas_erro('canal_clickup', 'Este pedido anda pelo ClickUp e não pode ser editado por aqui.');
    end if;
    perform _telas_expirar_um(s.id);
    select * into s from solicitacoes where id = p_id;

    if s.etapa_atual = 'edicao' then
      perform _telas_erro('ja_em_edicao', 'Este pedido já está em edição.');
    end if;
    if s.etapa_atual is distinct from 'lider' then
      perform _telas_erro('fora_da_janela', 'A liderança já decidiu este pedido: não dá mais para editar.');
    end if;
    if s.edicao_usada then
      perform _telas_erro('edicao_ja_usada', 'Este pedido já foi editado uma vez. Para mudar de novo, cancele e abra outro.');
    end if;
    if p_versao is distinct from s.versao then
      perform _telas_erro('versao_mudou', 'O pedido mudou desde que você abriu a tela. Atualize e tente de novo.');
    end if;

    update solicitacoes
       set etapa_atual = 'edicao', status = 'em edicao',
           em_edicao_desde = now(), entrou_na_etapa_em = now(), versao = versao + 1
     where id = s.id;
    perform _telas_mov(s.id, 'edicao_iniciada', 'lider', 'edicao', 'facilitador', f.id, f.nome);

    select * into s from solicitacoes where id = p_id;
    return jsonb_build_object('ok', true, 'versao', s.versao,
      'expira_em', s.em_edicao_desde + _telas_prazo_edicao(),
      'prazo_minutos', extract(epoch from _telas_prazo_edicao()) / 60,
      'mensagem', 'Você tem ' || (extract(epoch from _telas_prazo_edicao()) / 60)::int ||
                  ' minutos para salvar. Depois disso, o pedido volta para a liderança como estava.');
  exception
    when sqlstate 'P0001' then
      get stacked diagnostics v_cod = message_text, v_msg = pg_exception_hint;
      return jsonb_build_object('ok', false, 'erro', v_cod, 'mensagem', v_msg);
    when check_violation or invalid_text_representation or numeric_value_out_of_range
         or invalid_datetime_format or datetime_field_overflow then
      return jsonb_build_object('ok', false, 'erro', 'valor_invalido',
        'mensagem', 'Algum valor não está no formato certo: ' || sqlerrm);
  end;
end $$;

create or replace function public.salvar_edicao(p_token text, p_id uuid, p_cabecalho jsonb, p_itens jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_cod text; v_msg text;
  f facilitadores%rowtype; s solicitacoes%rowtype;
  v_antes jsonb; v_mudou jsonb := '{}'::jsonb; k text;
  v_itens_antes jsonb; v_itens_depois jsonb; v_n int;
  campos text[] := array['solicitante_nome','observacao','empresa_id','centro_custo','unidade_destino',
                         'local_entrega','tipo_compra','definicao_fornecedor','justificativa_fornecedor',
                         'data_necessidade','motivo'];
begin
  begin
    select * into f from facilitadores where token = p_token and ativo;
    if f.id is null then
      perform _telas_erro('token_invalido', 'Este link não vale mais. Peça um novo com /compras no Slack.');
    end if;

    select * into s from solicitacoes where id = p_id for update;
    if s.id is null or s.facilitador_id is distinct from f.id then
      perform _telas_erro('nao_encontrado', 'Pedido não encontrado entre os seus.');
    end if;
    if _telas_expirar_um(s.id) then
      -- Venceu: o que estava sendo editado não vale; o pedido já voltou.
      return jsonb_build_object('ok', false, 'erro', 'edicao_expirou',
        'mensagem', 'Passaram os ' || (extract(epoch from _telas_prazo_edicao()) / 60)::int ||
                    ' minutos: a edição foi descartada e o pedido voltou para a liderança como estava.');
    end if;
    if s.etapa_atual is distinct from 'edicao' then
      perform _telas_erro('nao_esta_em_edicao', 'Este pedido não está em edição. Atualize a tela.');
    end if;

    perform _telas_validar_cabecalho(p_cabecalho);
    perform _telas_validar_itens(p_itens);

    -- O que mudou, campo a campo (vai para a linha do tempo e para o aviso).
    v_antes := to_jsonb(s);
    foreach k in array campos loop
      if coalesce(nullif(trim(v_antes->>k), ''), '') is distinct from
         coalesce(nullif(trim(case when k in ('tipo_compra','definicao_fornecedor')
                                   then lower(p_cabecalho->>k) else p_cabecalho->>k end), ''), '') then
        v_mudou := v_mudou || jsonb_build_object(k, jsonb_build_object(
                     'antes', v_antes->k, 'depois', p_cabecalho->k));
      end if;
    end loop;

    select coalesce(jsonb_agg(jsonb_build_object('descricao', descricao, 'quantidade', quantidade, 'unidade', unidade)
                              order by descricao, quantidade), '[]'::jsonb)
      into v_itens_antes from solicitacao_itens where solicitacao_id = s.id;

    update solicitacoes set
      solicitante_nome         = nullif(trim(p_cabecalho->>'solicitante_nome'), ''),
      observacao               = nullif(trim(p_cabecalho->>'observacao'), ''),
      empresa_id               = nullif(trim(p_cabecalho->>'empresa_id'), ''),
      centro_custo             = nullif(trim(p_cabecalho->>'centro_custo'), ''),
      unidade_destino          = nullif(trim(p_cabecalho->>'unidade_destino'), ''),
      local_entrega            = nullif(trim(p_cabecalho->>'local_entrega'), ''),
      tipo_compra              = lower(trim(p_cabecalho->>'tipo_compra')),
      prioridade               = case when lower(trim(p_cabecalho->>'tipo_compra')) = 'urgente' then 'urgente' else 'normal' end,
      definicao_fornecedor     = lower(trim(p_cabecalho->>'definicao_fornecedor')),
      justificativa_fornecedor = case when lower(trim(p_cabecalho->>'definicao_fornecedor')) = 'unico'
                                      then nullif(trim(p_cabecalho->>'justificativa_fornecedor'), '') end,
      data_necessidade         = nullif(trim(p_cabecalho->>'data_necessidade'), '')::date,
      motivo                   = nullif(trim(p_cabecalho->>'motivo'), ''),
      em_edicao_desde          = null,
      edicao_usada             = true
    where id = s.id;

    delete from solicitacao_itens where solicitacao_id = s.id;
    insert into solicitacao_itens (id, solicitacao_id, codigo, descricao, unidade, quantidade, fora_catalogo)
    select gen_random_uuid(), s.id,
           nullif(trim(i->>'codigo'), ''), trim(i->>'descricao'), nullif(trim(i->>'unidade'), ''),
           (i->>'quantidade')::numeric, coalesce((i->>'fora_catalogo')::boolean, false)
      from jsonb_array_elements(p_itens) i;
    get diagnostics v_n = row_count;

    select coalesce(jsonb_agg(jsonb_build_object('descricao', descricao, 'quantidade', quantidade, 'unidade', unidade)
                              order by descricao, quantidade), '[]'::jsonb)
      into v_itens_depois from solicitacao_itens where solicitacao_id = s.id;

    if v_itens_antes is distinct from v_itens_depois then
      v_mudou := v_mudou || jsonb_build_object('itens', jsonb_build_object(
                   'antes', v_itens_antes, 'depois', v_itens_depois));
    end if;

    perform _telas_mover(s.id, 'lider', s.aprovador_atual, 'aguardando aprovacao');
    perform _telas_mov(s.id, 'edicao_salva', 'edicao', 'lider', 'facilitador', f.id, f.nome, null,
      jsonb_build_object('mudou', v_mudou, 'itens', v_n),
      jsonb_build_array(jsonb_build_object('papel', 'aprovador', 'id', s.aprovador_atual)));

    select * into s from solicitacoes where id = p_id;
    return jsonb_build_object('ok', true, 'versao', s.versao, 'mudou', v_mudou,
      'mensagem', case when v_mudou = '{}'::jsonb
                       then 'Salvo sem alterações. O pedido voltou para a liderança.'
                       else 'Alterações salvas. O pedido voltou para a liderança, que foi avisada.' end);
  exception
    when sqlstate 'P0001' then
      get stacked diagnostics v_cod = message_text, v_msg = pg_exception_hint;
      return jsonb_build_object('ok', false, 'erro', v_cod, 'mensagem', v_msg);
    when check_violation or invalid_text_representation or numeric_value_out_of_range
         or invalid_datetime_format or datetime_field_overflow then
      return jsonb_build_object('ok', false, 'erro', 'valor_invalido',
        'mensagem', 'Algum valor não está no formato certo: ' || sqlerrm);
  end;
end $$;

create or replace function public.desistir_edicao(p_token text, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_cod text; v_msg text; f facilitadores%rowtype; s solicitacoes%rowtype;
begin
  begin
    select * into f from facilitadores where token = p_token and ativo;
    if f.id is null then
      perform _telas_erro('token_invalido', 'Este link não vale mais. Peça um novo com /compras no Slack.');
    end if;
    select * into s from solicitacoes where id = p_id for update;
    if s.id is null or s.facilitador_id is distinct from f.id then
      perform _telas_erro('nao_encontrado', 'Pedido não encontrado entre os seus.');
    end if;
    if _telas_expirar_um(s.id) then
      return jsonb_build_object('ok', true, 'mensagem', 'O prazo já tinha passado: o pedido já estava de volta com a liderança.');
    end if;
    if s.etapa_atual is distinct from 'edicao' then
      perform _telas_erro('nao_esta_em_edicao', 'Este pedido não está em edição. Atualize a tela.');
    end if;

    update solicitacoes set em_edicao_desde = null where id = s.id;
    perform _telas_mover(s.id, 'lider', s.aprovador_atual, 'aguardando aprovacao');
    perform _telas_mov(s.id, 'edicao_desistida', 'edicao', 'lider', 'facilitador', f.id, f.nome);

    select * into s from solicitacoes where id = p_id;
    return jsonb_build_object('ok', true, 'versao', s.versao,
      'mensagem', 'Nada foi alterado. O pedido voltou para a liderança e você ainda pode editar uma vez.');
  exception
    when sqlstate 'P0001' then
      get stacked diagnostics v_cod = message_text, v_msg = pg_exception_hint;
      return jsonb_build_object('ok', false, 'erro', v_cod, 'mensagem', v_msg);
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Cancelar (antes de a liderança aprovar; também durante a própria edição)
-- ---------------------------------------------------------------------------
create or replace function public.cancelar_pedido(p_token text, p_id uuid, p_versao integer, p_motivo text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_cod text; v_msg text; f facilitadores%rowtype; s solicitacoes%rowtype; v_etapa text; v_para jsonb := '[]'::jsonb;
begin
  begin
    select * into f from facilitadores where token = p_token and ativo;
    if f.id is null then
      perform _telas_erro('token_invalido', 'Este link não vale mais. Peça um novo com /compras no Slack.');
    end if;
    select * into s from solicitacoes where id = p_id for update;
    if s.id is null or s.facilitador_id is distinct from f.id then
      perform _telas_erro('nao_encontrado', 'Pedido não encontrado entre os seus.');
    end if;
    if s.canal <> 'telas' then
      perform _telas_erro('canal_clickup', 'Este pedido anda pelo ClickUp e não pode ser cancelado por aqui.');
    end if;
    perform _telas_expirar_um(s.id);
    select * into s from solicitacoes where id = p_id;

    if s.etapa_atual is null or s.etapa_atual not in ('lider', 'edicao') then
      perform _telas_erro('fora_da_janela', 'A liderança já decidiu este pedido: não dá mais para cancelar por aqui.');
    end if;
    if p_versao is distinct from s.versao then
      perform _telas_erro('versao_mudou', 'O pedido mudou desde que você abriu a tela. Atualize e tente de novo.');
    end if;

    v_etapa := s.etapa_atual;
    if s.aprovador_atual is not null then
      v_para := jsonb_build_array(jsonb_build_object('papel', 'aprovador', 'id', s.aprovador_atual));
    end if;

    update solicitacoes set em_edicao_desde = null, cancelado_em = now() where id = s.id;
    perform _telas_mover(s.id, null, null, 'cancelado');
    perform _telas_mov(s.id, 'cancelado', v_etapa, null, 'facilitador', f.id, f.nome, p_motivo,
      '{}'::jsonb, v_para);

    return jsonb_build_object('ok', true, 'mensagem', 'Pedido cancelado.');
  exception
    when sqlstate 'P0001' then
      get stacked diagnostics v_cod = message_text, v_msg = pg_exception_hint;
      return jsonb_build_object('ok', false, 'erro', v_cod, 'mensagem', v_msg);
  end;
end $$;

revoke execute on function public._telas_validar_cabecalho(jsonb), public._telas_validar_itens(jsonb)
  from public, anon, authenticated;
-- ============================================================================
-- CAMINHO DAS TELAS · 3b · MAPA DE COTAÇÃO (Mesa do comprador)
-- ============================================================================

-- Resumo e conferência do mapa. Um lugar só para as regras da Mesa: a tela
-- mostra o que esta função diz, e o envio só passa se ela não tiver bloqueio.
--
-- Regras (as mesmas do protótipo):
--   total do fornecedor = itens escolhidos − desconto % + frete;
--   o frete só entra se o fornecedor ganhou item;
--   "menor preço" compara já com o desconto.
-- Bloqueiam: item sem escolha; escolha sem preço; vencedor sem nome, frete,
--   prazo ou condição; vencedor fora do cadastro de fornecedores; nome repetido
--   na família; fornecedor único usando coluna que não é a 1.
-- Avisam (exigem observação ao aprovador): item com menos de 3 preços (exceto
--   fornecedor único); escolha que não é o menor preço.
create or replace function public._telas_resumo_mapa(p_sol uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  s solicitacoes%rowtype;
  v_unico boolean;
  v_bloq jsonb := '[]'::jsonb;
  v_avis jsonb := '[]'::jsonb;
  v_fams jsonb := '[]'::jsonb;
  v_total numeric := 0;
  r record; fam text; col int;
  v_forn jsonb; v_sub numeric; v_n int; v_tot numeric; mf mapa_fornecedores%rowtype;
  v_fam_total numeric;
begin
  select * into s from solicitacoes where id = p_sol;
  v_unico := (s.definicao_fornecedor = 'unico');

  -- Item a item
  for r in
    select i.id, i.descricao, i.quantidade, _telas_familia(i.codigo) as familia,
           e.coluna as escolhida,
           (select count(*) from mapa_precos p where p.item_id = i.id) as n_precos,
           (select p.preco_unitario from mapa_precos p where p.item_id = i.id and p.coluna = e.coluna) as preco_escolhido,
           (select min(p.preco_unitario * (1 - coalesce(f.desconto_pct, 0) / 100))
              from mapa_precos p
              left join mapa_fornecedores f
                on f.solicitacao_id = p_sol and f.familia = _telas_familia(i.codigo) and f.coluna = p.coluna
             where p.item_id = i.id) as menor_efetivo,
           (select p.preco_unitario * (1 - coalesce(f.desconto_pct, 0) / 100)
              from mapa_precos p
              left join mapa_fornecedores f
                on f.solicitacao_id = p_sol and f.familia = _telas_familia(i.codigo) and f.coluna = p.coluna
             where p.item_id = i.id and p.coluna = e.coluna) as escolhido_efetivo
      from solicitacao_itens i
      left join mapa_escolhas e on e.item_id = i.id
     where i.solicitacao_id = p_sol
     order by i.descricao
  loop
    if r.escolhida is null then
      v_bloq := v_bloq || jsonb_build_object('item_id', r.id, 'familia', r.familia,
                  'msg', 'Escolha o fornecedor do item "' || r.descricao || '".');
    elsif r.preco_escolhido is null then
      v_bloq := v_bloq || jsonb_build_object('item_id', r.id, 'familia', r.familia,
                  'msg', 'O fornecedor escolhido para "' || r.descricao || '" está sem preço.');
    end if;
    if v_unico and r.escolhida is not null and r.escolhida <> 1 then
      v_bloq := v_bloq || jsonb_build_object('item_id', r.id, 'familia', r.familia,
                  'msg', 'Fornecedor único: use só a primeira coluna.');
    end if;
    if not v_unico and r.n_precos < 3 then
      v_avis := v_avis || jsonb_build_object('item_id', r.id, 'familia', r.familia,
                  'msg', '"' || r.descricao || '" tem ' || r.n_precos || ' preço(s); o padrão são 3.');
    end if;
    if r.escolhido_efetivo is not null and r.menor_efetivo is not null
       and r.escolhido_efetivo > r.menor_efetivo then
      v_avis := v_avis || jsonb_build_object('item_id', r.id, 'familia', r.familia,
                  'msg', 'A escolha de "' || r.descricao || '" não é o menor preço.');
    end if;
  end loop;

  -- Família a família, fornecedor a fornecedor
  for fam in
    select distinct _telas_familia(i.codigo) from solicitacao_itens i
     where i.solicitacao_id = p_sol order by 1
  loop
    v_forn := '[]'::jsonb; v_fam_total := 0;

    -- nome repetido na família
    if exists (select 1 from mapa_fornecedores f
                where f.solicitacao_id = p_sol and f.familia = fam
                  and nullif(trim(f.fornecedor_nome), '') is not null
                group by lower(trim(f.fornecedor_nome)) having count(*) > 1) then
      v_bloq := v_bloq || jsonb_build_object('familia', fam,
                  'msg', 'O mesmo fornecedor aparece duas vezes na família ' || fam || '.');
    end if;

    for col in 1..3 loop
      select * into mf from mapa_fornecedores f
       where f.solicitacao_id = p_sol and f.familia = fam and f.coluna = col;

      select count(*), coalesce(sum(p.preco_unitario * i.quantidade), 0)
        into v_n, v_sub
        from solicitacao_itens i
        join mapa_escolhas e on e.item_id = i.id and e.coluna = col
        join mapa_precos p on p.item_id = i.id and p.coluna = col
       where i.solicitacao_id = p_sol and _telas_familia(i.codigo) = fam;

      v_tot := case when v_n > 0
                    then round(v_sub * (1 - coalesce(mf.desconto_pct, 0) / 100) + coalesce(mf.frete, 0), 2)
                    else 0 end;

      if v_n > 0 then
        if nullif(trim(mf.fornecedor_nome), '') is null then
          v_bloq := v_bloq || jsonb_build_object('familia', fam, 'coluna', col,
                      'msg', 'Falta o nome do fornecedor ' || col || ' da família ' || fam || '.');
        elsif mf.fornecedor_id is null then
          v_bloq := v_bloq || jsonb_build_object('familia', fam, 'coluna', col,
                      'msg', '"' || mf.fornecedor_nome || '" não está no cadastro de fornecedores. Escolha pela busca.');
        end if;
        if mf.frete is null then
          v_bloq := v_bloq || jsonb_build_object('familia', fam, 'coluna', col,
                      'msg', 'Informe o frete do fornecedor ' || col || ' da família ' || fam || ' (0 se incluso).');
        end if;
        if mf.prazo_dias is null then
          v_bloq := v_bloq || jsonb_build_object('familia', fam, 'coluna', col,
                      'msg', 'Informe o prazo de entrega do fornecedor ' || col || ' da família ' || fam || '.');
        end if;
        if nullif(trim(mf.condicao), '') is null then
          v_bloq := v_bloq || jsonb_build_object('familia', fam, 'coluna', col,
                      'msg', 'Informe a condição de pagamento do fornecedor ' || col || ' da família ' || fam || '.');
        end if;
      end if;

      if mf.solicitacao_id is not null or v_n > 0 then
        v_forn := v_forn || jsonb_build_object(
          'coluna', col, 'fornecedor_id', mf.fornecedor_id, 'nome', mf.fornecedor_nome,
          'desconto_pct', mf.desconto_pct, 'frete', mf.frete, 'prazo_dias', mf.prazo_dias,
          'condicao', mf.condicao, 'itens_ganhos', v_n, 'subtotal', round(v_sub, 2), 'total', v_tot);
      end if;
      v_fam_total := v_fam_total + v_tot;
    end loop;

    v_fams := v_fams || jsonb_build_object('familia', fam, 'fornecedores', v_forn, 'total', v_fam_total);
    v_total := v_total + v_fam_total;
  end loop;

  return jsonb_build_object('total', v_total, 'familias', v_fams,
    'bloqueios', v_bloq, 'avisos', v_avis, 'pode_enviar', jsonb_array_length(v_bloq) = 0);
end $$;

-- ---------------------------------------------------------------------------
-- Fila do comprador: Para cotar · Devolvidas · Enviadas (só o caminho das telas)
-- ---------------------------------------------------------------------------
create or replace function public.fila_do_comprador(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c compradores%rowtype; v jsonb;
begin
  select * into c from compradores where token = p_token and ativo;
  if c.id is null then
    return jsonb_build_object('ok', false, 'erro', 'token_invalido', 'mensagem', 'Este link não vale mais.');
  end if;

  select coalesce(jsonb_agg(x order by (x->>'urgente')::boolean desc, x->>'data_necessidade' nulls last, x->>'desde'), '[]'::jsonb)
    into v
  from (
    select jsonb_build_object(
      'id', s.id, 'numero', s.numero, 'versao', s.versao,
      'aba', case when s.etapa_atual = 'cotacao' and m.estado = 'devolvida' then 'devolvidas'
                  when s.etapa_atual = 'cotacao' then 'para_cotar'
                  else 'enviadas' end,
      'tipo_compra', s.tipo_compra, 'urgente', (s.tipo_compra = 'urgente'),
      'definicao_fornecedor', s.definicao_fornecedor,
      'assunto', coalesce(s.motivo, 'Solicitação de compra'),
      'data_necessidade', s.data_necessidade,
      'facilitador', f.nome, 'unidade', f.unidade, 'centro_custo_nome', cc.nome,
      'comprador_responsavel', co.nome, 'e_meu', (f.comprador_id = c.id),
      'total_itens', (select count(*) from solicitacao_itens i where i.solicitacao_id = s.id),
      'familias', (select jsonb_agg(distinct _telas_familia(i.codigo)) from solicitacao_itens i where i.solicitacao_id = s.id),
      'etapa_atual', s.etapa_atual, 'situacao', _telas_situacao(s.status, s.etapa_atual),
      'com_quem', ap.nome,
      'desde', coalesce(s.entrou_na_etapa_em, s.aberto_em),
      'dias_parado', ((now() at time zone 'America/Sao_Paulo')::date - (coalesce(s.entrou_na_etapa_em, s.aberto_em) at time zone 'America/Sao_Paulo')::date),
      'mapa_estado', m.estado, 'mapa_versao', m.versao, 'total', m.total,
      'devolucao', (select jsonb_build_object('motivo', mv.motivo, 'por', mv.quem_nome, 'etapa', mv.etapa, 'em', mv.em)
                      from movimentos_compra mv
                     where mv.solicitacao_id = s.id and mv.acao = 'devolvido'
                     order by mv.em desc limit 1)
    ) as x
    from solicitacoes s
    left join facilitadores f on f.id = s.facilitador_id
    left join compradores co on co.id = f.comprador_id
    left join centros_custo cc on cc.codigo = s.centro_custo
    left join aprovadores ap on ap.id = s.aprovador_atual
    left join mapa_cotacao m on m.solicitacao_id = s.id
    where s.canal = 'telas'
      and (s.etapa_atual = 'cotacao'
           or (m.estado = 'enviada' and s.etapa_atual in ('gerencial', 'financeiro')))
  ) t;

  return jsonb_build_object('ok', true, 'comprador', c.nome, 'pedidos', v);
end $$;

-- ---------------------------------------------------------------------------
-- Salvar o rascunho do mapa (substitui o rascunho inteiro)
--
-- p_mapa = {
--   "observacao": "...",
--   "fornecedores": [{"familia","coluna","fornecedor_id","fornecedor_nome",
--                     "desconto_pct","frete","prazo_dias","condicao"}],
--   "precos":   [{"item_id","coluna","preco"}],
--   "escolhas": [{"item_id","coluna"}]
-- }
-- Números vêm como número JSON (a tela converte "1.234,56").
-- p_versao_mapa: a versão que a tela carregou (null/0 se ainda não existe).
-- ---------------------------------------------------------------------------
create or replace function public.salvar_mapa(p_token text, p_id uuid, p_versao_mapa integer, p_mapa jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_cod text; v_msg text;
  c compradores%rowtype; s solicitacoes%rowtype; m mapa_cotacao%rowtype;
  x jsonb; v_fams text[]; v_nome text; v_forn_id text; v_prazo numeric;
begin
  begin
    select * into c from compradores where token = p_token and ativo;
    if c.id is null then
      perform _telas_erro('token_invalido', 'Este link não vale mais.');
    end if;
    select * into s from solicitacoes where id = p_id for update;
    if s.id is null then
      perform _telas_erro('nao_encontrado', 'Pedido não encontrado.');
    end if;
    if s.canal <> 'telas' then
      perform _telas_erro('canal_clickup', 'Este pedido anda pelo ClickUp.');
    end if;
    if s.etapa_atual is distinct from 'cotacao' then
      perform _telas_erro('fora_da_cotacao', 'Este pedido não está em cotação. Atualize a tela.');
    end if;

    select * into m from mapa_cotacao where solicitacao_id = s.id for update;
    if m.solicitacao_id is null then
      if coalesce(p_versao_mapa, 0) <> 0 then
        perform _telas_erro('versao_mudou', 'O mapa mudou desde que você abriu. Atualize a tela.');
      end if;
      insert into mapa_cotacao (solicitacao_id, estado, versao, atualizado_por)
      values (s.id, 'rascunho', 0, c.nome) returning * into m;
    elsif p_versao_mapa is distinct from m.versao then
      perform _telas_erro('versao_mudou', 'O mapa foi salvo em outra aba ou por outra pessoa. Atualize a tela.');
    end if;

    select array_agg(distinct _telas_familia(i.codigo)) into v_fams
      from solicitacao_itens i where i.solicitacao_id = s.id;

    delete from mapa_escolhas     where solicitacao_id = s.id;
    delete from mapa_precos       where solicitacao_id = s.id;
    delete from mapa_fornecedores where solicitacao_id = s.id;

    for x in select * from jsonb_array_elements(coalesce(p_mapa->'fornecedores', '[]'::jsonb)) loop
      if not ((x->>'familia') = any(v_fams)) then
        perform _telas_erro('familia_invalida', 'Família "' || coalesce(x->>'familia', '') || '" não existe neste pedido.');
      end if;
      v_forn_id := nullif(trim(x->>'fornecedor_id'), '');
      v_nome := nullif(trim(x->>'fornecedor_nome'), '');
      if v_forn_id is not null then
        v_nome := null;
        select coalesce(nullif(trim(fo.nome_curto), ''), fo.razao_social) into v_nome
          from fornecedores fo where fo.id = v_forn_id and fo.ativo;
        if v_nome is null then
          perform _telas_erro('fornecedor_invalido', 'Fornecedor não encontrado no cadastro.');
        end if;
      end if;
      v_prazo := nullif(x->>'prazo_dias', '')::numeric;
      if v_prazo is not null and v_prazo <> trunc(v_prazo) then
        perform _telas_erro('prazo_invalido', 'Prazo de entrega é em dias inteiros.');
      end if;
      insert into mapa_fornecedores (solicitacao_id, familia, coluna, fornecedor_id, fornecedor_nome,
                                     desconto_pct, frete, prazo_dias, condicao)
      values (s.id, x->>'familia', (x->>'coluna')::smallint, v_forn_id, v_nome,
              nullif(x->>'desconto_pct', '')::numeric, nullif(x->>'frete', '')::numeric,
              v_prazo::integer, nullif(trim(x->>'condicao'), ''));
    end loop;

    for x in select * from jsonb_array_elements(coalesce(p_mapa->'precos', '[]'::jsonb)) loop
      if nullif(x->>'preco', '') is null then continue; end if;
      if not exists (select 1 from solicitacao_itens i where i.id = (x->>'item_id')::uuid and i.solicitacao_id = s.id) then
        perform _telas_erro('item_invalido', 'Item não pertence a este pedido.');
      end if;
      insert into mapa_precos (item_id, coluna, solicitacao_id, preco_unitario)
      values ((x->>'item_id')::uuid, (x->>'coluna')::smallint, s.id, (x->>'preco')::numeric);
    end loop;

    for x in select * from jsonb_array_elements(coalesce(p_mapa->'escolhas', '[]'::jsonb)) loop
      if nullif(x->>'coluna', '') is null then continue; end if;
      if not exists (select 1 from solicitacao_itens i where i.id = (x->>'item_id')::uuid and i.solicitacao_id = s.id) then
        perform _telas_erro('item_invalido', 'Item não pertence a este pedido.');
      end if;
      insert into mapa_escolhas (item_id, solicitacao_id, coluna)
      values ((x->>'item_id')::uuid, s.id, (x->>'coluna')::smallint);
    end loop;

    update mapa_cotacao
       set observacao = nullif(trim(p_mapa->>'observacao'), ''),
           versao = versao + 1, atualizado_em = now(), atualizado_por = c.nome
     where solicitacao_id = s.id
     returning * into m;

    return jsonb_build_object('ok', true, 'versao_mapa', m.versao, 'estado', m.estado,
                              'resumo', _telas_resumo_mapa(s.id));
  exception
    when sqlstate 'P0001' then
      get stacked diagnostics v_cod = message_text, v_msg = pg_exception_hint;
      return jsonb_build_object('ok', false, 'erro', v_cod, 'mensagem', v_msg);
    when unique_violation then
      return jsonb_build_object('ok', false, 'erro', 'repetido',
        'mensagem', 'Há preço, escolha ou fornecedor repetido para o mesmo item/coluna.');
    when check_violation or invalid_text_representation or numeric_value_out_of_range
         or foreign_key_violation or not_null_violation then
      return jsonb_build_object('ok', false, 'erro', 'valor_invalido',
        'mensagem', 'Algum valor do mapa não está no formato certo: ' || sqlerrm);
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Enviar para aprovação
-- ---------------------------------------------------------------------------
create or replace function public.enviar_mapa(p_token text, p_id uuid, p_versao_mapa integer, p_observacao text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_cod text; v_msg text;
  c compradores%rowtype; s solicitacoes%rowtype; m mapa_cotacao%rowtype; f facilitadores%rowtype;
  a aprovadores%rowtype; v_res jsonb; v_obs text; v_prox text; v_reenvio boolean; v_forns text;
begin
  begin
    select * into c from compradores where token = p_token and ativo;
    if c.id is null then
      perform _telas_erro('token_invalido', 'Este link não vale mais.');
    end if;
    select * into s from solicitacoes where id = p_id for update;
    if s.id is null then
      perform _telas_erro('nao_encontrado', 'Pedido não encontrado.');
    end if;
    if s.canal <> 'telas' then
      perform _telas_erro('canal_clickup', 'Este pedido anda pelo ClickUp.');
    end if;
    if s.etapa_atual is distinct from 'cotacao' then
      perform _telas_erro('fora_da_cotacao', 'Este pedido não está em cotação. Atualize a tela.');
    end if;
    select * into m from mapa_cotacao where solicitacao_id = s.id for update;
    if m.solicitacao_id is null then
      perform _telas_erro('mapa_vazio', 'Preencha e salve o mapa antes de enviar.');
    end if;
    if p_versao_mapa is distinct from m.versao then
      perform _telas_erro('versao_mudou', 'O mapa mudou desde que você abriu. Atualize a tela.');
    end if;

    v_res := _telas_resumo_mapa(s.id);
    if jsonb_array_length(v_res->'bloqueios') > 0 then
      return jsonb_build_object('ok', false, 'erro', 'cotacao_incompleta',
        'mensagem', 'Falta resolver ' || jsonb_array_length(v_res->'bloqueios') || ' ponto(s) antes de enviar.',
        'bloqueios', v_res->'bloqueios', 'avisos', v_res->'avisos');
    end if;

    v_reenvio := (m.estado = 'devolvida');
    v_obs := coalesce(nullif(trim(p_observacao), ''), m.observacao);
    if (jsonb_array_length(v_res->'avisos') > 0 or v_reenvio) and v_obs is null then
      return jsonb_build_object('ok', false, 'erro', 'observacao_obrigatoria',
        'mensagem', case when v_reenvio
                         then 'Reenvio de cotação devolvida exige uma observação ao aprovador.'
                         else 'Há avisos no mapa: escreva uma observação ao aprovador explicando.' end,
        'avisos', v_res->'avisos');
    end if;

    select * into f from facilitadores where id = s.facilitador_id;
    v_prox := _telas_etapa_apos_cotacao(s.tipo_compra, f.id);
    select * into a from aprovadores where id = _telas_aprovador_da_etapa(f.id, v_prox) and ativo;
    if a.id is null then
      perform _telas_erro('aprovador_sem_cadastro', 'Não há aprovador cadastrado para a etapa ' || v_prox || '. Avise o administrador.');
    end if;

    select string_agg(distinct mf.fornecedor_nome, ', ' order by mf.fornecedor_nome) into v_forns
      from mapa_fornecedores mf
     where mf.solicitacao_id = s.id
       and exists (select 1 from mapa_escolhas e join solicitacao_itens i on i.id = e.item_id
                    where e.solicitacao_id = s.id and e.coluna = mf.coluna
                      and _telas_familia(i.codigo) = mf.familia);

    update mapa_cotacao
       set estado = 'enviada', total = (v_res->>'total')::numeric, observacao = v_obs,
           enviada_em = now(), enviada_por = c.nome, envios = envios + 1,
           versao = versao + 1, atualizado_em = now(), atualizado_por = c.nome
     where solicitacao_id = s.id;

    update solicitacoes
       set valor_cotado = (v_res->>'total')::numeric, fornecedor_cotado = v_forns, cotacao_em = now()
     where id = s.id;

    perform _telas_mover(s.id, v_prox, a.id, 'aguardando aprovacao');
    perform _telas_mov(s.id, 'cotacao_enviada', 'cotacao', v_prox, 'comprador', c.id, c.nome, v_obs,
      jsonb_build_object('total', (v_res->>'total')::numeric, 'fornecedores', v_forns,
                         'reenvio', v_reenvio, 'avisos', v_res->'avisos'),
      jsonb_build_array(jsonb_build_object('papel', 'aprovador', 'id', a.id),
                        jsonb_build_object('papel', 'facilitador', 'id', f.id)));

    return jsonb_build_object('ok', true, 'etapa', v_prox, 'com_quem', a.nome,
      'total', (v_res->>'total')::numeric,
      'mensagem', 'Cotação enviada para ' || case v_prox when 'gerencial' then 'a aprovação gerencial'
                                                      else 'a aprovação financeira' end || ' (' || a.nome || ').');
  exception
    when sqlstate 'P0001' then
      get stacked diagnostics v_cod = message_text, v_msg = pg_exception_hint;
      return jsonb_build_object('ok', false, 'erro', v_cod, 'mensagem', v_msg);
  end;
end $$;

revoke execute on function public._telas_resumo_mapa(uuid) from public, anon, authenticated;
-- ============================================================================
-- CAMINHO DAS TELAS · 3c · APROVADOR, DETALHE, FUNIL E AVISOS
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Fila do aprovador (os dois canais: a tela decide por onde mandar a decisão)
-- ---------------------------------------------------------------------------
create or replace function public.fila_do_aprovador(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a aprovadores%rowtype; r record; v jsonb; v_ed jsonb;
begin
  select * into a from aprovadores where token = p_token and ativo;
  if a.id is null then
    return jsonb_build_object('ok', false, 'erro', 'token_invalido', 'mensagem', 'Este link não vale mais.');
  end if;

  for r in select id from solicitacoes
            where canal = 'telas' and etapa_atual = 'edicao' and aprovador_atual = a.id
              and em_edicao_desde <= now() - _telas_prazo_edicao()
            for update skip locked
  loop perform _telas_expirar_um(r.id); end loop;

  select coalesce(jsonb_agg(x order by (x->>'urgente')::boolean desc, x->>'aberto_em'), '[]'::jsonb) into v
  from (
    select jsonb_build_object(
      'id', s.id, 'numero', s.numero, 'canal', s.canal, 'versao', s.versao, 'card_id', s.card_id,
      'etapa_atual', s.etapa_atual, 'tipo_compra', s.tipo_compra, 'urgente', (s.tipo_compra = 'urgente'),
      'facilitador', coalesce(f.nome, s.facilitador), 'solicitante_nome', s.solicitante_nome,
      'centro_custo', s.centro_custo, 'centro_custo_nome', cc.nome,
      'data_necessidade', s.data_necessidade, 'motivo', s.motivo, 'aberto_em', s.aberto_em,
      'total_itens', (select count(*) from solicitacao_itens i where i.solicitacao_id = s.id),
      'valor_cotado', s.valor_cotado, 'fornecedor_cotado', s.fornecedor_cotado,
      'desde', coalesce(s.entrou_na_etapa_em, s.aberto_em),
      'editado', s.edicao_usada,
      'pode_devolver', (s.canal = 'telas' and (
                          (fluxo_da_compra(s.tipo_compra) = 'padrao' and s.etapa_atual in ('gerencial','financeiro'))
                       or (fluxo_da_compra(s.tipo_compra) = 'mensal' and s.etapa_atual = 'financeiro')))
    ) as x
    from solicitacoes s
    left join facilitadores f on f.id = s.facilitador_id
    left join centros_custo cc on cc.codigo = s.centro_custo
    where s.aprovador_atual = a.id and s.etapa_atual = any(a.etapas)
  ) t;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id, 'numero', s.numero, 'facilitador', f.nome,
           'em_edicao_desde', s.em_edicao_desde,
           'volta_ate', s.em_edicao_desde + _telas_prazo_edicao()) order by s.em_edicao_desde), '[]'::jsonb)
    into v_ed
    from solicitacoes s left join facilitadores f on f.id = s.facilitador_id
   where s.canal = 'telas' and s.etapa_atual = 'edicao' and s.aprovador_atual = a.id;

  return jsonb_build_object('ok', true, 'aprovador', a.nome, 'etapas', to_jsonb(a.etapas),
                            'pedidos', v, 'em_edicao', v_ed);
end $$;

-- ---------------------------------------------------------------------------
-- Decidir: aprovar, reprovar (motivo), devolver ao comprador (motivo)
-- ---------------------------------------------------------------------------
create or replace function public.decidir_pedido(p_token text, p_id uuid, p_versao integer,
                                                 p_decisao text, p_motivo text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_cod text; v_msg text;
  a aprovadores%rowtype; s solicitacoes%rowtype; f facilitadores%rowtype; prox_a aprovadores%rowtype;
  v_fluxo text; v_etapa text; passo jsonb; v_prox text; v_status text; v_para jsonb; v_motivo text;
begin
  begin
    select * into a from aprovadores where token = p_token and ativo;
    if a.id is null then
      perform _telas_erro('token_invalido', 'Este link de aprovação não vale mais.');
    end if;
    select * into s from solicitacoes where id = p_id for update;
    if s.id is null then
      perform _telas_erro('nao_encontrado', 'Pedido não encontrado.');
    end if;
    if s.canal <> 'telas' then
      perform _telas_erro('canal_clickup', 'Este pedido anda pelo ClickUp: decida pelo caminho de sempre.');
    end if;
    perform _telas_expirar_um(s.id);
    select * into s from solicitacoes where id = p_id;

    if s.etapa_atual = 'edicao' then
      perform _telas_erro('em_edicao', 'O facilitador está editando este pedido desde ' ||
        to_char(s.em_edicao_desde at time zone 'America/Sao_Paulo', 'HH24:MI') ||
        '. Espere ele terminar (no máximo até ' ||
        to_char((s.em_edicao_desde + _telas_prazo_edicao()) at time zone 'America/Sao_Paulo', 'HH24:MI') || ').');
    end if;
    if s.etapa_atual is null then
      perform _telas_erro('ja_decidido', 'Este pedido já foi encerrado.');
    end if;
    if s.aprovador_atual is distinct from a.id or not (s.etapa_atual = any(a.etapas)) then
      perform _telas_erro('nao_e_a_vez', 'Este pedido não está esperando a sua decisão.');
    end if;
    if p_versao is distinct from s.versao then
      perform _telas_erro('versao_mudou', 'Este pedido foi alterado. Confira antes de decidir.');
    end if;
    if p_decisao is null or p_decisao not in ('aprovado', 'reprovado', 'devolvido') then
      perform _telas_erro('decisao_invalida', 'Decisão inválida.');
    end if;
    v_motivo := nullif(trim(p_motivo), '');
    if p_decisao in ('reprovado', 'devolvido') and v_motivo is null then
      perform _telas_erro('sem_motivo', case p_decisao when 'reprovado' then 'Reprovar exige motivo.'
                                                       else 'Devolver ao comprador exige motivo.' end);
    end if;

    select * into f from facilitadores where id = s.facilitador_id;
    v_fluxo := fluxo_da_compra(s.tipo_compra);
    v_etapa := s.etapa_atual;

    -- ---- Devolver ao comprador -------------------------------------------
    if p_decisao = 'devolvido' then
      if not ((v_fluxo = 'padrao' and v_etapa in ('gerencial', 'financeiro'))
              or (v_fluxo = 'mensal' and v_etapa = 'financeiro')) then
        perform _telas_erro('devolucao_nao_permitida', 'Nesta etapa não dá para devolver ao comprador.');
      end if;
      perform _telas_mover(s.id, 'cotacao', null, 'em cotacao');
      update mapa_cotacao set estado = 'devolvida', versao = versao + 1, atualizado_em = now()
       where solicitacao_id = s.id;
      perform _telas_mov(s.id, 'devolvido', v_etapa, 'cotacao', 'aprovador', a.id, a.nome, v_motivo, '{}'::jsonb,
        jsonb_build_array(jsonb_build_object('papel', 'comprador', 'id', f.comprador_id)));
      return jsonb_build_object('ok', true, 'etapa', 'cotacao',
        'mensagem', 'Devolvido ao comprador com o seu motivo.');
    end if;

    -- ---- Aprovar / reprovar: a tabela de roteamento de sempre ------------
    passo := passo_da_compra(s.tipo_compra, v_etapa, p_decisao);
    if passo ? 'erro' then
      perform _telas_erro(passo->>'erro', 'Não foi possível decidir nesta etapa.');
    end if;
    v_prox := passo->>'etapa';
    v_status := passo->>'status';

    if v_prox in ('gerencial', 'financeiro') then
      select * into prox_a from aprovadores where id = _telas_aprovador_da_etapa(f.id, v_prox) and ativo;
      if prox_a.id is null then
        perform _telas_erro('aprovador_sem_cadastro', 'Não há aprovador cadastrado para a próxima etapa (' || v_prox || ').');
      end if;
    end if;

    perform _telas_mover(s.id, v_prox, prox_a.id, v_status);

    -- `decisoes` guarda a ÚLTIMA decisão de cada etapa (as telas e o painel de
    -- hoje leem de lá). O histórico completo, com cada rodada, fica em movimentos.
    insert into decisoes (id, solicitacao_id, numero, etapa, resposta, motivo, valor_total,
                          aprovador_id, decidido_por, decidido_por_slack_id, decidido_em)
    values (gen_random_uuid(), s.id, s.numero, v_etapa, p_decisao, v_motivo,
            case when v_etapa in ('gerencial', 'financeiro') then s.valor_cotado end,
            a.id, a.nome, a.slack_user_id, now())
    on conflict (solicitacao_id, etapa) do update
      set resposta = excluded.resposta, motivo = excluded.motivo, valor_total = excluded.valor_total,
          aprovador_id = excluded.aprovador_id, decidido_por = excluded.decidido_por,
          decidido_por_slack_id = excluded.decidido_por_slack_id, decidido_em = excluded.decidido_em;

    if p_decisao = 'reprovado' then
      v_para := jsonb_build_array(jsonb_build_object('papel', 'facilitador', 'id', f.id));
      if v_etapa = 'financeiro' and f.gerente_id is not null and f.gerente_id <> a.id then
        v_para := v_para || jsonb_build_object('papel', 'aprovador', 'id', f.gerente_id);
      end if;
    elsif v_prox in ('gerencial', 'financeiro') then
      v_para := jsonb_build_array(jsonb_build_object('papel', 'aprovador', 'id', prox_a.id),
                                  jsonb_build_object('papel', 'facilitador', 'id', f.id));
    elsif v_prox = 'cotacao' then
      v_para := jsonb_build_array(jsonb_build_object('papel', 'comprador', 'id', f.comprador_id),
                                  jsonb_build_object('papel', 'facilitador', 'id', f.id));
    else
      -- aprovado no fim: vai para ordem de compra
      v_para := jsonb_build_array(jsonb_build_object('papel', 'facilitador', 'id', f.id),
                                  jsonb_build_object('papel', 'comprador', 'id', f.comprador_id));
    end if;

    perform _telas_mov(s.id, p_decisao, v_etapa, v_prox, 'aprovador', a.id, a.nome, v_motivo,
      jsonb_build_object('valor', s.valor_cotado, 'coluna', passo->>'coluna'), v_para);

    return jsonb_build_object('ok', true, 'etapa', coalesce(v_prox, 'fim'), 'status', v_status,
      'com_quem', prox_a.nome,
      'mensagem', case
        when p_decisao = 'reprovado' then 'Reprovado. Quem pediu foi avisado com o motivo.'
        when v_prox is null then 'Aprovado. O pedido segue para a ordem de compra.'
        when v_prox = 'cotacao' then 'Aprovado. O pedido segue para a cotação.'
        else 'Aprovado. O pedido segue para ' || prox_a.nome || '.' end);
  exception
    when sqlstate 'P0001' then
      get stacked diagnostics v_cod = message_text, v_msg = pg_exception_hint;
      return jsonb_build_object('ok', false, 'erro', v_cod, 'mensagem', v_msg);
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Detalhe do pedido para qualquer papel, com o que CADA UM pode ver e fazer
--   facilitador: os pedidos dele (sem os preços da cotação)
--   aprovador:   os pedidos da cadeia dele (líder, gerente, financeiro do facilitador)
--   comprador:   todos (o comprador vê todos os pedidos)
--   diretoria:   todos
-- ---------------------------------------------------------------------------
create or replace function public.pedido_telas(p_token text, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  q jsonb; s solicitacoes%rowtype; f facilitadores%rowtype; v_tipo text; v_quem text;
  v_pode boolean; v_mapa jsonb; v_linha jsonb; m mapa_cotacao%rowtype;
begin
  q := _telas_quem(p_token);
  if q is null then
    return jsonb_build_object('ok', false, 'erro', 'token_invalido', 'mensagem', 'Este link não vale mais.');
  end if;
  v_tipo := q->>'tipo'; v_quem := q->>'id';

  select * into s from solicitacoes where id = p_id;
  if s.id is null then
    return jsonb_build_object('ok', false, 'erro', 'nao_encontrado', 'mensagem', 'Pedido não encontrado.');
  end if;
  select * into f from facilitadores where id = s.facilitador_id;

  v_pode := case v_tipo
    when 'facilitador' then s.facilitador_id = v_quem
    when 'aprovador'   then v_quem in (f.superior_id, f.gerente_id, f.financeiro_id)
                            or s.aprovador_atual = v_quem
                            or exists (select 1 from decisoes d where d.solicitacao_id = s.id and d.aprovador_id = v_quem)
    when 'comprador'   then true
    when 'diretoria'   then true
    else false end;
  if not coalesce(v_pode, false) then
    return jsonb_build_object('ok', false, 'erro', 'sem_acesso', 'mensagem', 'Este pedido não está no seu alcance.');
  end if;

  -- Edição vencida sai antes de mostrar (sem travar: é só leitura se não venceu).
  if s.canal = 'telas' and s.etapa_atual = 'edicao' and s.em_edicao_desde <= now() - _telas_prazo_edicao() then
    perform 1 from solicitacoes where id = s.id for update;
    perform _telas_expirar_um(s.id);
    select * into s from solicitacoes where id = p_id;
  end if;

  -- Linha do tempo: caminho das telas pelos movimentos; ClickUp pelas decisões.
  if s.canal = 'telas' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'acao', mv.acao, 'etapa', mv.etapa, 'etapa_seguinte', mv.etapa_seguinte,
             'quem', mv.quem_nome, 'quem_tipo', mv.quem_tipo,
             -- Para o facilitador: motivo só de reprovação e cancelamento; a
             -- conversa de preço entre comprador e aprovador não é dele.
             'motivo', case when v_tipo <> 'facilitador' or mv.acao in ('reprovado', 'cancelado')
                            then mv.motivo end,
             'mudou', mv.detalhe->'mudou',
             'total', case when v_tipo <> 'facilitador' then mv.detalhe->'total' end,
             'em', mv.em)
           order by mv.em, mv.id), '[]'::jsonb)
      into v_linha
      from movimentos_compra mv
     where mv.solicitacao_id = s.id
       and mv.acao <> 'cotacao_salva';
  else
    select coalesce(jsonb_agg(jsonb_build_object(
             'acao', d.resposta, 'etapa', d.etapa, 'quem', d.decidido_por, 'motivo', d.motivo, 'em', d.decidido_em)
           order by d.decidido_em), '[]'::jsonb)
      into v_linha from decisoes d where d.solicitacao_id = s.id;
  end if;

  -- Preços: nunca para o facilitador.
  if v_tipo <> 'facilitador' then
    select * into m from mapa_cotacao where solicitacao_id = s.id;
    if m.solicitacao_id is not null then
      v_mapa := jsonb_build_object(
        'estado', m.estado, 'versao', m.versao, 'observacao', m.observacao,
        'enviada_em', m.enviada_em, 'enviada_por', m.enviada_por, 'envios', m.envios,
        'resumo', _telas_resumo_mapa(s.id),
        'precos', coalesce((select jsonb_agg(jsonb_build_object('item_id', p.item_id, 'coluna', p.coluna, 'preco', p.preco_unitario))
                              from mapa_precos p where p.solicitacao_id = s.id), '[]'::jsonb),
        'escolhas', coalesce((select jsonb_agg(jsonb_build_object('item_id', e.item_id, 'coluna', e.coluna))
                                from mapa_escolhas e where e.solicitacao_id = s.id), '[]'::jsonb));
    end if;
  end if;

  return jsonb_build_object('ok', true, 'quem', q - 'etapas', 'pedido', jsonb_build_object(
      'id', s.id, 'numero', s.numero, 'canal', s.canal, 'versao', s.versao,
      'status', s.status, 'etapa_atual', s.etapa_atual,
      'situacao', _telas_situacao(s.status, s.etapa_atual),
      'com_quem', case when s.etapa_atual in ('lider','gerencial','financeiro')
                         then (select nome from aprovadores where id = s.aprovador_atual)
                       when s.etapa_atual = 'cotacao'
                         then (select nome from compradores where id = f.comprador_id)
                       when s.etapa_atual = 'edicao' then f.nome end,
      'desde', coalesce(s.entrou_na_etapa_em, s.aberto_em),
      'tipo_compra', s.tipo_compra, 'fluxo', fluxo_da_compra(s.tipo_compra),
      'definicao_fornecedor', s.definicao_fornecedor, 'justificativa_fornecedor', s.justificativa_fornecedor,
      'data_necessidade', s.data_necessidade, 'motivo', s.motivo, 'observacao', s.observacao,
      'solicitante_nome', s.solicitante_nome, 'facilitador', coalesce(f.nome, s.facilitador),
      'setor', f.setor, 'unidade', f.unidade,
      'centro_custo', s.centro_custo, 'centro_custo_nome', (select nome from centros_custo where codigo = s.centro_custo),
      'empresa_id', s.empresa_id, 'empresa_nome', (select nome from empresas where id = s.empresa_id),
      'local_entrega', s.local_entrega, 'unidade_destino', s.unidade_destino,
      'aberto_em', s.aberto_em, 'decidido_em', s.decidido_em,
      'valor_cotado', case when v_tipo <> 'facilitador' then s.valor_cotado end,
      'fornecedor_cotado', case when v_tipo <> 'facilitador' then s.fornecedor_cotado end,
      'em_edicao', (s.etapa_atual = 'edicao'),
      'em_edicao_desde', s.em_edicao_desde,
      'edicao_expira_em', case when s.etapa_atual = 'edicao' then s.em_edicao_desde + _telas_prazo_edicao() end,
      'edicao_usada', s.edicao_usada),
    'itens', coalesce((select jsonb_agg(jsonb_build_object(
               'id', i.id, 'codigo', i.codigo, 'descricao', i.descricao, 'unidade', i.unidade,
               'quantidade', i.quantidade, 'fora_catalogo', i.fora_catalogo, 'familia', _telas_familia(i.codigo))
             order by _telas_familia(i.codigo), i.descricao)
             from solicitacao_itens i where i.solicitacao_id = s.id), '[]'::jsonb),
    'anexos', coalesce((select jsonb_agg(jsonb_build_object('id', an.id, 'nome', an.nome, 'mime', an.mime,
                                         'tamanho', an.tamanho, 'enviado_em', an.enviado_em) order by an.enviado_em)
                          from solicitacao_anexos an where an.solicitacao_id = s.id), '[]'::jsonb),
    'linha_do_tempo', v_linha,
    'mapa', v_mapa,
    'pode', jsonb_build_object(
      'editar',   (v_tipo = 'facilitador' and s.canal = 'telas' and s.etapa_atual = 'lider' and not s.edicao_usada),
      'cancelar', (v_tipo = 'facilitador' and s.canal = 'telas' and s.etapa_atual in ('lider', 'edicao')),
      'decidir',  (v_tipo = 'aprovador' and s.canal = 'telas' and s.aprovador_atual = v_quem
                   and s.etapa_atual in ('lider', 'gerencial', 'financeiro')),
      'devolver', (v_tipo = 'aprovador' and s.canal = 'telas' and s.aprovador_atual = v_quem
                   and ((fluxo_da_compra(s.tipo_compra) = 'padrao' and s.etapa_atual in ('gerencial','financeiro'))
                        or (fluxo_da_compra(s.tipo_compra) = 'mensal' and s.etapa_atual = 'financeiro'))),
      'cotar',    (v_tipo = 'comprador' and s.canal = 'telas' and s.etapa_atual = 'cotacao')));
end $$;

-- ---------------------------------------------------------------------------
-- Funil da diretoria: os dois canais, quem segura, há quantos dias
-- ---------------------------------------------------------------------------
create or replace function public.funil_da_diretoria(p_token text, p_dias_encerrados integer default 30)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_nome text; v jsonb; v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select nome into v_nome from painel_acesso where token = p_token and ativo;
  if v_nome is null then
    return jsonb_build_object('ok', false, 'erro', 'sem_acesso', 'mensagem', 'Este link não dá acesso ao painel.');
  end if;

  perform liberar_edicoes_vencidas();

  select coalesce(jsonb_agg(x order by (x->>'encerrado')::boolean, (x->>'dias_parado')::int desc nulls last, x->>'aberto_em'), '[]'::jsonb)
    into v
  from (
    select jsonb_build_object(
      'id', s.id, 'numero', s.numero, 'canal', s.canal,
      'tipo_compra', s.tipo_compra, 'fluxo', fluxo_da_compra(s.tipo_compra),
      'status', s.status, 'etapa_atual', s.etapa_atual,
      'situacao', _telas_situacao(s.status, s.etapa_atual),
      'encerrado', (s.etapa_atual is null),
      'em_edicao', (s.etapa_atual = 'edicao'),
      'com_quem', case when s.etapa_atual in ('lider','gerencial','financeiro') then ap.nome
                       when s.etapa_atual = 'cotacao' then co.nome
                       when s.etapa_atual = 'edicao' then f.nome end,
      'parado_desde', pd.desde,
      'dias_parado', case when s.etapa_atual is not null
                          then v_hoje - (pd.desde at time zone 'America/Sao_Paulo')::date end,
      'assunto', coalesce(s.motivo, 'Solicitação de compra'),
      'facilitador', coalesce(f.nome, s.facilitador), 'setor', f.setor, 'unidade', f.unidade,
      'centro_custo_nome', cc.nome, 'valor_cotado', s.valor_cotado,
      'aberto_em', s.aberto_em, 'decidido_em', s.decidido_em
    ) as x
    from solicitacoes s
    left join facilitadores f on f.id = s.facilitador_id
    left join aprovadores ap on ap.id = s.aprovador_atual
    left join compradores co on co.id = f.comprador_id
    left join centros_custo cc on cc.codigo = s.centro_custo
    cross join lateral (
      select case when s.canal = 'telas' then coalesce(s.entrou_na_etapa_em, s.aberto_em)
                  else greatest(s.aberto_em, s.cotacao_em,
                                (select max(d.decidido_em) from decisoes d where d.solicitacao_id = s.id)) end as desde
    ) pd
    where s.status is distinct from 'encerrado (teste)'
      and (s.etapa_atual is not null
           or coalesce(s.decidido_em, s.aberto_em) >= now() - make_interval(days => greatest(0, coalesce(p_dias_encerrados, 30))))
  ) t;

  return jsonb_build_object('ok', true, 'quem', v_nome, 'pedidos', v);
end $$;

-- ---------------------------------------------------------------------------
-- Avisos: o n8n busca, manda no Slack e marca. Só com a credencial do servidor.
-- Cada destinatário vem com o Slack e o token dele, para o link pessoal da DM.
-- ---------------------------------------------------------------------------
create or replace function public.avisos_pendentes(p_limite integer default 50)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by (x->>'id')::bigint), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', mv.id, 'acao', mv.acao, 'etapa', mv.etapa, 'etapa_seguinte', mv.etapa_seguinte,
      'solicitacao_id', mv.solicitacao_id, 'numero', mv.numero,
      'tipo_compra', s.tipo_compra, 'assunto', s.motivo,
      'quem', mv.quem_nome, 'motivo', mv.motivo, 'em', mv.em, 'tentativas', mv.aviso_tentativas,
      'total', mv.detalhe->'total', 'mudou', mv.detalhe->'mudou',
      'para', (select coalesce(jsonb_agg(jsonb_build_object(
                 'papel', p->>'papel', 'id', p->>'id',
                 'nome',  case p->>'papel' when 'aprovador'   then (select nome from aprovadores   where id = p->>'id')
                                           when 'facilitador' then (select nome from facilitadores where id = p->>'id')
                                           when 'comprador'   then (select nome from compradores   where id = p->>'id') end,
                 'slack', case p->>'papel' when 'aprovador'   then (select slack_user_id from aprovadores   where id = p->>'id')
                                           when 'facilitador' then (select slack_user_id from facilitadores where id = p->>'id')
                                           when 'comprador'   then (select slack_user_id from compradores   where id = p->>'id') end,
                 'token', case p->>'papel' when 'aprovador'   then (select token from aprovadores   where id = p->>'id' and ativo)
                                           when 'facilitador' then (select token from facilitadores where id = p->>'id' and ativo)
                                           when 'comprador'   then (select token from compradores   where id = p->>'id' and ativo) end
               )), '[]'::jsonb)
               from jsonb_array_elements(mv.detalhe->'para') p)
    ) as x
    from movimentos_compra mv
    join solicitacoes s on s.id = mv.solicitacao_id
    where mv.avisar and mv.avisado_em is null and mv.aviso_tentativas < 5
    order by mv.id
    limit greatest(1, least(coalesce(p_limite, 50), 200))
  ) t;
$$;

create or replace function public.marcar_aviso(p_id bigint, p_ok boolean, p_erro text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if p_ok then
    update movimentos_compra set avisado_em = now(), aviso_erro = null
     where id = p_id and avisado_em is null;
  else
    update movimentos_compra set aviso_tentativas = aviso_tentativas + 1, aviso_erro = left(p_erro, 500)
     where id = p_id and avisado_em is null;
  end if;
  return jsonb_build_object('ok', found);
end $$;

-- ---------------------------------------------------------------------------
-- Permissões: o que a tela chama fica aberto à chave pública (a função confere
-- o token); o que é do servidor fica só com a credencial do servidor.
-- ---------------------------------------------------------------------------
revoke execute on function public.avisos_pendentes(integer), public.marcar_aviso(bigint, boolean, text)
  from public, anon, authenticated;

grant execute on function
  public.abrir_pedido_telas(text, jsonb, jsonb), public.meus_pedidos(text, integer),
  public.iniciar_edicao(text, uuid, integer), public.salvar_edicao(text, uuid, jsonb, jsonb),
  public.desistir_edicao(text, uuid), public.cancelar_pedido(text, uuid, integer, text),
  public.fila_do_aprovador(text), public.decidir_pedido(text, uuid, integer, text, text),
  public.pedido_telas(text, uuid), public.fila_do_comprador(text),
  public.salvar_mapa(text, uuid, integer, jsonb), public.enviar_mapa(text, uuid, integer, text),
  public.funil_da_diretoria(text, integer)
  to anon, authenticated;
-- ============================================================================
-- CAMINHO DAS TELAS · ajustes aplicados depois da primeira bateria (23/09)
-- ============================================================================

-- 3d · Reenvio de cotação devolvida exige observação NOVA (a antiga já foi lida
-- por quem devolveu). No primeiro envio vale a observação salva no rascunho.
do $$
declare d text;
begin
  d := pg_get_functiondef('public.enviar_mapa(text,uuid,integer,text)'::regprocedure);
  d := replace(d,
$a$    v_obs := coalesce(nullif(trim(p_observacao), ''), m.observacao);
    if (jsonb_array_length(v_res->'avisos') > 0 or v_reenvio) and v_obs is null then$a$,
$b$    -- Reenvio de cotação devolvida exige observação NOVA: a antiga já foi lida
    -- por quem devolveu. No primeiro envio vale a observação salva no rascunho.
    v_obs := case when v_reenvio then nullif(trim(p_observacao), '')
                  else coalesce(nullif(trim(p_observacao), ''), m.observacao) end;
    if (jsonb_array_length(v_res->'avisos') > 0 or v_reenvio) and v_obs is null then$b$);
  if position('observação NOVA' in d) = 0 then raise exception 'trecho não encontrado'; end if;
  execute d;
end $$;

-- 3e · A liberação da edição vencida fica gravada mesmo quando a ação que a
-- disparou é recusada logo depois (liberar ANTES do bloco protegido).
create or replace function public._telas_liberar_se_vencida(p_sol uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_sol is null then return; end if;
  if exists (select 1 from solicitacoes where id = p_sol and canal = 'telas' and etapa_atual = 'edicao'
                and em_edicao_desde <= now() - _telas_prazo_edicao()) then
    perform 1 from solicitacoes where id = p_sol for update;
    perform _telas_expirar_um(p_sol);
  end if;
end $$;
revoke execute on function public._telas_liberar_se_vencida(uuid) from public, anon, authenticated;

do $$
declare fn text; d text; n int;
begin
  foreach fn in array array['public.decidir_pedido(text,uuid,integer,text,text)',
                            'public.iniciar_edicao(text,uuid,integer)',
                            'public.cancelar_pedido(text,uuid,integer,text)'] loop
    d := pg_get_functiondef(fn::regprocedure);
    n := length(d);
    d := regexp_replace(d, E'\\nbegin\\n  begin\\n',
           E'\nbegin\n  perform _telas_liberar_se_vencida(p_id);\n  begin\n', '');
    if length(d) = n then raise exception 'não achei o ponto de inserção em %', fn; end if;
    execute d;
  end loop;
end $$;

-- 3g · Bandeiras sempre true/false (pedido encerrado tem etapa nula).
create or replace function public._telas_sem_nulos(p jsonb)
returns jsonb language sql immutable set search_path = public as $$
  select coalesce(jsonb_object_agg(k, coalesce(v, 'false'::jsonb) ), '{}'::jsonb)
    from jsonb_each(p) as e(k, v);
$$;
revoke execute on function public._telas_sem_nulos(jsonb) from public, anon, authenticated;

do $$
declare d text;
begin
  d := pg_get_functiondef('public.meus_pedidos(text,integer)'::regprocedure);
  d := replace(d, $x$'em_edicao', (s.etapa_atual = 'edicao'),$x$, $x$'em_edicao', coalesce(s.etapa_atual = 'edicao', false),$x$);
  d := replace(d, $x$'pode_editar',   (s.canal = 'telas' and s.etapa_atual = 'lider' and not s.edicao_usada),$x$,
                  $x$'pode_editar',   coalesce(s.canal = 'telas' and s.etapa_atual = 'lider' and not s.edicao_usada, false),$x$);
  d := replace(d, $x$'pode_cancelar', (s.canal = 'telas' and s.etapa_atual in ('lider', 'edicao'))$x$,
                  $x$'pode_cancelar', coalesce(s.canal = 'telas' and s.etapa_atual in ('lider', 'edicao'), false)$x$);
  execute d;
  d := pg_get_functiondef('public.pedido_telas(text,uuid)'::regprocedure);
  d := replace(d, $x$'em_edicao', (s.etapa_atual = 'edicao'),$x$, $x$'em_edicao', coalesce(s.etapa_atual = 'edicao', false),$x$);
  d := replace(d, $x$'pode', jsonb_build_object($x$, $x$'pode', _telas_sem_nulos(jsonb_build_object($x$);
  d := replace(d, $x$s.etapa_atual = 'cotacao')));$x$, $x$s.etapa_atual = 'cotacao'))));$x$);
  execute d;
  d := pg_get_functiondef('public.funil_da_diretoria(text,integer)'::regprocedure);
  d := replace(d, $x$'em_edicao', (s.etapa_atual = 'edicao'),$x$, $x$'em_edicao', coalesce(s.etapa_atual = 'edicao', false),$x$);
  execute d;
end $$;

-- 3h · search_path fixo nas funções auxiliares
alter function public._telas_situacao(text, text) set search_path = public;
alter function public._telas_prazo_edicao() set search_path = public;
alter function public._telas_erro(text, text) set search_path = public;

-- ============================================================================
-- 3i · 24/09 · A edição única conta ao clicar em Editar (decisão do Guilherme):
-- desistir ou deixar vencer os 30 min também gasta a chance.
-- ============================================================================
comment on column public.solicitacoes.edicao_usada is
  'O facilitador edita uma vez só. Vira true ao clicar em Editar (desistir ou deixar vencer também gasta).';

do $$
declare d text; n int;
begin
  d := pg_get_functiondef('public.iniciar_edicao(text,uuid,integer)'::regprocedure);
  d := replace(d,
    $x$em_edicao_desde = now(), entrou_na_etapa_em = now(), versao = versao + 1$x$,
    $x$em_edicao_desde = now(), entrou_na_etapa_em = now(), versao = versao + 1,
           edicao_usada = true$x$);
  d := replace(d,
    $x$' minutos para salvar. Depois disso, o pedido volta para a liderança como estava.'$x$,
    $x$' minutos para salvar. Depois disso, o pedido volta para a liderança como estava. Esta é a única edição permitida: se desistir ou o prazo passar, não dá para editar de novo.'$x$);
  if position('edicao_usada = true' in d) = 0 or position('única edição' in d) = 0 then
    raise exception 'iniciar_edicao: substituição não bateu';
  end if;
  execute d;

  d := pg_get_functiondef('public.desistir_edicao(text,uuid)'::regprocedure); n := length(d);
  d := replace(d,
    $x$'Nada foi alterado. O pedido voltou para a liderança e você ainda pode editar uma vez.'$x$,
    $x$'Nada foi alterado. O pedido voltou para a liderança. A edição deste pedido já foi usada.'$x$);
  if length(d) = n then raise exception 'desistir_edicao: substituição não bateu'; end if;
  execute d;
end $$;

-- ============================================================================
-- 4 · 24/09 · Avisos: o n8n RESERVA os pendentes (marca como enviados na mesma
-- transação) e só devolve à fila os que falharam. Duas rodadas que se encostem
-- nunca mandam a mesma DM duas vezes; falha volta até 5 tentativas.
-- Workflow: Compras · Telas · Avisos no Slack e edições vencidas (K4koz6mFwBDfDt94)
-- ============================================================================
create or replace function public._telas_payload_avisos(p_ids bigint[])
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by (x->>'id')::bigint), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', mv.id, 'acao', mv.acao, 'etapa', mv.etapa, 'etapa_seguinte', mv.etapa_seguinte,
      'solicitacao_id', mv.solicitacao_id, 'numero', mv.numero,
      'tipo_compra', s.tipo_compra, 'urgente', (s.tipo_compra = 'urgente'),
      'assunto', s.motivo, 'facilitador', f.nome,
      'quem', mv.quem_nome, 'motivo', mv.motivo, 'em', mv.em, 'tentativas', mv.aviso_tentativas,
      'total', mv.detalhe->'total', 'mudou', mv.detalhe->'mudou', 'reenvio', mv.detalhe->'reenvio',
      'para', (select coalesce(jsonb_agg(jsonb_build_object(
                 'papel', p->>'papel', 'id', p->>'id',
                 'nome',  case p->>'papel' when 'aprovador'   then (select nome from aprovadores   where id = p->>'id')
                                           when 'facilitador' then (select nome from facilitadores where id = p->>'id')
                                           when 'comprador'   then (select nome from compradores   where id = p->>'id') end,
                 'slack', case p->>'papel' when 'aprovador'   then (select slack_user_id from aprovadores   where id = p->>'id')
                                           when 'facilitador' then (select slack_user_id from facilitadores where id = p->>'id')
                                           when 'comprador'   then (select slack_user_id from compradores   where id = p->>'id') end,
                 'token', case p->>'papel' when 'aprovador'   then (select token from aprovadores   where id = p->>'id' and ativo)
                                           when 'facilitador' then (select token from facilitadores where id = p->>'id' and ativo)
                                           when 'comprador'   then (select token from compradores   where id = p->>'id' and ativo) end
               )), '[]'::jsonb)
               from jsonb_array_elements(mv.detalhe->'para') p)
    ) as x
    from movimentos_compra mv
    join solicitacoes s on s.id = mv.solicitacao_id
    left join facilitadores f on f.id = s.facilitador_id
    where mv.id = any(p_ids)
  ) t;
$$;

create or replace function public.avisos_pendentes(p_limite integer default 50)
returns jsonb language sql stable security definer set search_path = public as $$
  select _telas_payload_avisos(array(
    select id from movimentos_compra
     where avisar and avisado_em is null and aviso_tentativas < 5
     order by id limit greatest(1, least(coalesce(p_limite, 50), 200))));
$$;

create or replace function public.reservar_avisos(p_limite integer default 50)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_ids bigint[];
begin
  with alvo as (
    select id from movimentos_compra
     where avisar and avisado_em is null and aviso_tentativas < 5
     order by id
     limit greatest(1, least(coalesce(p_limite, 50), 200))
     for update skip locked
  ), marcados as (
    update movimentos_compra m set avisado_em = now(), aviso_erro = null
      from alvo where m.id = alvo.id
    returning m.id
  )
  select array_agg(id order by id) into v_ids from marcados;
  return _telas_payload_avisos(coalesce(v_ids, array[]::bigint[]));
end $$;

create or replace function public.marcar_aviso(p_id bigint, p_ok boolean, p_erro text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if p_ok then
    update movimentos_compra set avisado_em = coalesce(avisado_em, now()), aviso_erro = null where id = p_id;
  else
    update movimentos_compra
       set avisado_em = null, aviso_tentativas = aviso_tentativas + 1, aviso_erro = left(p_erro, 500)
     where id = p_id;
  end if;
  return jsonb_build_object('ok', found);
end $$;

revoke execute on function public._telas_payload_avisos(bigint[]), public.avisos_pendentes(integer),
  public.reservar_avisos(integer), public.marcar_aviso(bigint, boolean, text)
  from public, anon, authenticated;

-- ============================================================================
-- 5 · 24/09 · O comprador pode reprovar o pedido, com motivo obrigatório,
-- enquanto ele está em cotação. Encerra o pedido e avisa quem pediu.
-- ============================================================================
create or replace function public.reprovar_na_cotacao(p_token text, p_id uuid, p_versao integer, p_motivo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_cod text; v_msg text;
  c compradores%rowtype; s solicitacoes%rowtype; f facilitadores%rowtype; v_motivo text;
begin
  begin
    select * into c from compradores where token = p_token and ativo;
    if c.id is null then
      perform _telas_erro('token_invalido', 'Este link não vale mais.');
    end if;
    select * into s from solicitacoes where id = p_id for update;
    if s.id is null then
      perform _telas_erro('nao_encontrado', 'Pedido não encontrado.');
    end if;
    if s.canal <> 'telas' then
      perform _telas_erro('canal_clickup', 'Este pedido anda pelo ClickUp.');
    end if;
    if s.etapa_atual is distinct from 'cotacao' then
      perform _telas_erro('fora_da_cotacao', 'Este pedido não está em cotação. Atualize a tela.');
    end if;
    if p_versao is distinct from s.versao then
      perform _telas_erro('versao_mudou', 'O pedido mudou desde que você abriu a tela. Atualize e confira.');
    end if;
    v_motivo := nullif(trim(p_motivo), '');
    if v_motivo is null then
      perform _telas_erro('sem_motivo', 'Reprovar exige motivo.');
    end if;

    select * into f from facilitadores where id = s.facilitador_id;

    perform _telas_mover(s.id, null, null, 'reprovado');

    insert into decisoes (id, solicitacao_id, numero, etapa, resposta, motivo,
                          aprovador_id, decidido_por, decidido_por_slack_id, decidido_em)
    values (gen_random_uuid(), s.id, s.numero, 'compras', 'reprovado', v_motivo,
            null, c.nome, c.slack_user_id, now())
    on conflict (solicitacao_id, etapa) do update
      set resposta = excluded.resposta, motivo = excluded.motivo,
          decidido_por = excluded.decidido_por, decidido_por_slack_id = excluded.decidido_por_slack_id,
          decidido_em = excluded.decidido_em;

    perform _telas_mov(s.id, 'reprovado', 'cotacao', null, 'comprador', c.id, c.nome, v_motivo, '{}'::jsonb,
      jsonb_build_array(jsonb_build_object('papel', 'facilitador', 'id', f.id)));

    return jsonb_build_object('ok', true, 'status', 'reprovado',
      'mensagem', 'Pedido reprovado. Quem pediu foi avisado com o motivo.');
  exception
    when sqlstate 'P0001' then
      get stacked diagnostics v_cod = message_text, v_msg = pg_exception_hint;
      return jsonb_build_object('ok', false, 'erro', v_cod, 'mensagem', v_msg);
  end;
end $$;

grant execute on function public.reprovar_na_cotacao(text, uuid, integer, text) to anon, authenticated;

do $$
declare d text;
begin
  d := pg_get_functiondef('public.pedido_telas(text,uuid)'::regprocedure);
  d := replace(d,
    $x$'cotar',    (v_tipo = 'comprador' and s.canal = 'telas' and s.etapa_atual = 'cotacao')$x$,
    $x$'cotar',    (v_tipo = 'comprador' and s.canal = 'telas' and s.etapa_atual = 'cotacao'),
      'reprovar_cotacao', (v_tipo = 'comprador' and s.canal = 'telas' and s.etapa_atual = 'cotacao')$x$);
  if position('reprovar_cotacao' in d) = 0 then raise exception 'pedido_telas: trecho não encontrado'; end if;
  execute d;
end $$;

-- ============================================================================
-- 6 · 24/09 · Quem é o facilitador deste link (formulário pelo caminho das telas)
-- O formulário (index.html?t=...) precisa do nome para mostrar e travar o campo.
-- Só a própria pessoa: nome, e-mail e unidade. Nada do organograma.
-- facilitador_do_token (do acompanhamento antigo) fica como está.
-- ============================================================================
create or replace function public.eu_facilitador(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare f facilitadores%rowtype;
begin
  if coalesce(trim(p_token), '') = '' then
    return jsonb_build_object('ok', false, 'erro', 'token_invalido', 'mensagem', 'Link incompleto.');
  end if;
  select * into f from facilitadores where token = p_token and ativo;
  if f.id is null then
    return jsonb_build_object('ok', false, 'erro', 'token_invalido',
      'mensagem', 'Este link não vale mais. Peça um novo com /compras no Slack.');
  end if;
  return jsonb_build_object('ok', true, 'nome', f.nome, 'email', f.email, 'unidade', f.unidade,
    'prazo_edicao_minutos', extract(epoch from _telas_prazo_edicao()) / 60);
end $$;
revoke all on function public.eu_facilitador(text) from public;
grant execute on function public.eu_facilitador(text) to anon, authenticated;

-- ============================================================================
-- 7 · 24/09 · A edição do facilitador muda SÓ OS ITENS (decisão do Guilherme).
-- O cabeçalho que vier da tela é ignorado: salvar_edicao usa o que já está
-- gravado. Assim nem uma tela antiga nem uma chamada montada à mão mudam
-- motivo, centro de custo, tipo, empresa ou data pela edição.
-- ============================================================================
do $$
declare d text; antes text;
begin
  d := pg_get_functiondef('public.salvar_edicao(text,uuid,jsonb,jsonb)'::regprocedure);
  antes := d;
  d := replace(d, 'perform _telas_validar_cabecalho(p_cabecalho);',
$r$-- Só os itens mudam na edição: o cabeçalho é o que já está gravado.
    p_cabecalho := jsonb_build_object(
      'solicitante_nome', s.solicitante_nome, 'observacao', s.observacao, 'empresa_id', s.empresa_id,
      'centro_custo', s.centro_custo, 'unidade_destino', s.unidade_destino, 'local_entrega', s.local_entrega,
      'tipo_compra', s.tipo_compra, 'definicao_fornecedor', s.definicao_fornecedor,
      'justificativa_fornecedor', s.justificativa_fornecedor, 'data_necessidade', s.data_necessidade,
      'motivo', s.motivo);$r$);
  if d = antes then raise exception 'salvar_edicao: ponto de troca não encontrado'; end if;
  execute d;
end $$;
