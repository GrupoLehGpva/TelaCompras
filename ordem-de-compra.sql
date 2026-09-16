-- ============================================================================
-- FASE 4 — A ORDEM DE COMPRA CHEGANDO NO GR
--
-- Levantado da OC 3862 (WIENFRIED MATTHIAS LEH - PR), que o Guilherme mandou
-- em 16/09/2026. Cada coluna aqui existe porque aparece impressa naquele papel.
--
-- O DESENHO MUDOU
--
-- O plano de 10/09 era "um RPA lê o card do ClickUp e preenche o GR". Morreu
-- por duas razões que apareceram depois: a cota de campos personalizados do
-- ClickUp está esgotada, e o Supabase virou a fonte da verdade.
--
-- E o Guilherme confirmou em 16/09 que **o GR aceita importação de arquivo**.
-- Isso tira de cena o robô de tela — frágil por natureza, quebra quando um
-- campo muda de lugar — e põe no lugar: o banco gera um arquivo, o arquivo é
-- depositado onde o GR lê, o GR importa. A ordem nasce pendente de aprovação,
-- como a 3862 mostra, e um humano confirma dentro do GR.
--
-- O que ainda falta para gerar o arquivo é o LAYOUT dele, que só quem cuida do
-- GR pode dizer. Este arquivo constrói tudo que independe disso.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- FORNECEDORES
--
-- Hoje o fornecedor existe só como `cotacoes.fornecedor_nome`, texto livre
-- digitado pelo comprador. Serve para comparar três preços; não serve para
-- emitir ordem de compra, que imprime razão social, CNPJ, endereço e telefone.
--
-- Texto livre também significa que "POMIAGRO", "Pomiagro Ltda" e "POMIAGRO
-- COMERCIO DE PRODUTOS AGROPECUARIOS LTDA" são três fornecedores diferentes
-- para qualquer relatório que alguém tente fazer depois.
-- ---------------------------------------------------------------------------
create table if not exists public.fornecedores (
  id            text primary key,          -- slug estável: 'pomiagro'
  codigo_gr     text,                      -- o código dele no GR
  razao_social  text not null,
  nome_curto    text,                      -- como o comprador chama no dia a dia
  cnpj          text,                      -- só dígitos; a máscara é da tela
  endereco      text,
  bairro        text,
  cep           text,
  cidade        text,
  uf            text check (uf is null or length(uf) = 2),
  telefone      text,
  email         text,
  observacao    text,
  ativo         boolean not null default true,
  atualizado_em timestamptz not null default now()
);

create unique index if not exists fornecedores_codigo_gr
  on public.fornecedores (codigo_gr) where codigo_gr is not null;

-- O `codigo_gr` segue a mesma lógica do item: a OC 3862 traz o item 8210, que
-- é o Id (GR) e existe igual no nosso catálogo. O arquivo de importação quase
-- certamente casa fornecedor por CÓDIGO, não por razão social — e casar por
-- texto é onde os três POMIAGRO acima viram três cadastros.

alter table public.cotacoes
  add column if not exists fornecedor_id text references public.fornecedores(id);

-- ---------------------------------------------------------------------------
-- O ENDEREÇO DE COBRANÇA
--
-- Na OC 3862 ele é DIFERENTE do de entrega: entrega na Fazenda Noricum km 394,
-- cobrança na Fazenda Noricum km 18. Tratar os dois como um só é boleto
-- chegando no lugar errado.
-- ---------------------------------------------------------------------------
alter table public.empresas
  add column if not exists cobranca_endereco text,
  add column if not exists cobranca_bairro   text,
  add column if not exists cobranca_cep      text,
  add column if not exists cobranca_cidade   text;

-- ---------------------------------------------------------------------------
-- A ORDEM DE COMPRA
--
-- `numero_gr` começa vazio e recebe o número que o GR devolve (o 3862 da
-- imagem). Sem ele não há como, meses depois, ligar um boleto que chegou a uma
-- solicitação que alguém abriu — que é exatamente a pergunta que o financeiro
-- faz. E é ele que responde duas pendências de 10/09: hoje nada marca que a
-- compra foi efetivada, e o card pode ir de `efetuar compra` direto para
-- `complete` sem passar pelo GR, sem nada acusar.
-- ---------------------------------------------------------------------------
create table if not exists public.ordens_compra (
  id              uuid primary key default gen_random_uuid(),
  solicitacao_id  uuid not null references public.solicitacoes(id) on delete cascade,
  cotacao_id      uuid references public.cotacoes(id),
  empresa_id      text references public.empresas(id),
  fornecedor_id   text references public.fornecedores(id),

  numero_gr       text,
  situacao        text not null default 'a lancar'
                  check (situacao in ('a lancar','arquivo gerado','no gr','cancelada')),

  condicoes_pagamento text,
  prazo_entrega       text,
  entrega_endereco    text,
  entrega_roteiro     text,
  cobranca_endereco   text,

  total_liquido   numeric(14,2),

  criada_em       timestamptz not null default now(),
  arquivo_em      timestamptz,
  lancada_em      timestamptz,
  lancada_por     text
);

create index if not exists ordens_compra_solicitacao on public.ordens_compra (solicitacao_id);
create unique index if not exists ordens_compra_numero_gr
  on public.ordens_compra (numero_gr) where numero_gr is not null;

-- ---------------------------------------------------------------------------
-- OS ITENS DA ORDEM — FOTOGRAFIA, NÃO ESPELHO
--
-- Cópia do que foi comprado, no momento da compra. NÃO é referência viva para
-- `solicitacao_itens`: preço muda, catálogo muda, e uma ordem de compra emitida
-- não pode mudar de valor porque alguém editou um cadastro depois.
-- ---------------------------------------------------------------------------
create table if not exists public.ordem_compra_itens (
  id             uuid primary key default gen_random_uuid(),
  ordem_id       uuid not null references public.ordens_compra(id) on delete cascade,
  ordem_linha    int  not null,
  codigo         text not null,        -- o Id (GR)
  descricao      text not null,
  unidade        text not null,
  quantidade     numeric(14,3) not null,
  preco_unitario numeric(14,4) not null,
  valor_bruto    numeric(14,2) not null,
  valor_liquido  numeric(14,2) not null
);

create index if not exists ordem_compra_itens_ordem on public.ordem_compra_itens (ordem_id);

-- ---------------------------------------------------------------------------
-- QUEM PODE LER
--
-- Nada disso é público: fornecedores têm CNPJ, ordens têm preço negociado.
-- A chave publicável está num repositório público — ver o que aconteceu com a
-- tabela `empresas` na manhã de 16/09.
-- ---------------------------------------------------------------------------
alter table public.fornecedores       enable row level security;
alter table public.ordens_compra      enable row level security;
alter table public.ordem_compra_itens enable row level security;

revoke all on table public.fornecedores       from anon, authenticated;
revoke all on table public.ordens_compra      from anon, authenticated;
revoke all on table public.ordem_compra_itens from anon, authenticated;

-- ============================================================================
-- MONTAR A ORDEM, OU DIZER O QUE FALTA
--
-- Devolve a OC pronta para virar arquivo — ou a lista do que impede. Nunca
-- devolve pela metade.
--
-- POR QUE É FUNÇÃO E NÃO CONSULTA NA TELA
--
-- Porque a mesma pergunta vai ser feita de três lugares: a tela de conferência
-- do comprador, o fluxo que gera o arquivo, e quem for conferir. Três cópias da
-- regra são três chances de divergirem — e a que diverge em silêncio é a que
-- gera arquivo faltando o CNPJ do fornecedor.
--
-- Provado em transação desfeita reproduzindo a OC 3862: 200 × 38,807 =
-- 7.761,40, centavo por centavo. E provado nos dois sentidos: sem os dados de
-- faturamento e sem cadastro de fornecedor, ela recusa e lista o que falta;
-- um item novo sem preço volta a travar.
-- ============================================================================
create or replace function public.ordem_de_compra_do_pedido(p_solicitacao_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  s record; emp record; forn record; cot record;
  faltando text[] := '{}';
  v_itens json; qtd int; v_total numeric; v_com_preco int;
begin
  select * into s from public.solicitacoes where id = p_solicitacao_id;
  if not found then
    return json_build_object('ok', false, 'codigo', 'sem_solicitacao',
      'faltando', to_json(array['a solicitação não existe']::text[]));
  end if;

  select * into emp  from public.empresas where id = s.empresa_id;
  select * into cot  from public.cotacoes where solicitacao_id = s.id order by criada_em desc limit 1;
  if cot.id is not null then
    select * into forn from public.fornecedores where id = cot.fornecedor_id;
  end if;

  -- ---- a empresa que compra, e para quem o fornecedor fatura ----
  if emp.id is null then
    faltando := faltando || 'a empresa do pedido'::text;
  else
    if coalesce(emp.inscricao_estadual,'') = '' then faltando := faltando || ('inscrição estadual de ' || emp.nome)::text; end if;
    if coalesce(emp.documento,'')          = '' then faltando := faltando || ('CNPJ/CPF de ' || emp.nome)::text; end if;
    if coalesce(emp.endereco,'')           = '' then faltando := faltando || ('endereço de faturamento de ' || emp.nome)::text; end if;
    if coalesce(emp.email,'')              = '' then faltando := faltando || ('e-mail de faturamento de ' || emp.nome)::text; end if;
    if coalesce(emp.cobranca_endereco,'')  = '' then faltando := faltando || ('endereço de cobrança de ' || emp.nome)::text; end if;
  end if;

  -- ---- de quem se compra ----
  if cot.id is null then
    faltando := faltando || 'a cotação escolhida'::text;
  elsif forn.id is null then
    faltando := faltando || ('o cadastro do fornecedor ' ||
      coalesce(nullif(cot.fornecedor_nome,''), '(sem nome)') ||
      ' — a cotação tem o nome digitado, mas a ordem de compra precisa de CNPJ e endereço')::text;
  else
    if coalesce(forn.cnpj,'')     = '' then faltando := faltando || ('CNPJ de ' || forn.razao_social)::text; end if;
    if coalesce(forn.endereco,'') = '' then faltando := faltando || ('endereço de ' || forn.razao_social)::text; end if;
  end if;

  -- ---- para onde vai ----
  if coalesce(nullif(trim(s.local_entrega),''), nullif(trim(s.unidade_destino),'')) is null then
    faltando := faltando || 'o local de entrega'::text;
  end if;

  -- ---- os itens, com preço ----
  select count(*) into qtd from public.solicitacao_itens where solicitacao_id = s.id;
  if qtd = 0 then
    faltando := faltando || 'os itens do pedido'::text;
  end if;

  if cot.id is not null then
    select coalesce(json_agg(x order by ord), '[]'::json), coalesce(sum(valor), 0), count(*)
      into v_itens, v_total, v_com_preco
      from (
        select row_number() over (order by i.descricao, i.codigo) as ord,
               round(i.quantidade * p.preco_unitario, 2) as valor,
               json_build_object(
                 'linha', row_number() over (order by i.descricao, i.codigo),
                 'codigo', i.codigo, 'descricao', i.descricao, 'unidade', i.unidade,
                 'quantidade', i.quantidade, 'preco_unitario', p.preco_unitario,
                 'valor', round(i.quantidade * p.preco_unitario, 2)) as x
          from public.solicitacao_itens i
          join public.cotacao_precos p
            on p.item_id = i.id and p.cotacao_id = cot.id
           and coalesce(p.sem_item, false) = false and p.preco_unitario > 0
         where i.solicitacao_id = s.id
      ) t;

    if qtd > 0 and v_com_preco <> qtd then
      faltando := faltando || ('preço de ' || (qtd - v_com_preco) ||
        ' item(ns) — a ordem de compra não sai com item sem preço')::text;
    end if;
  end if;

  if array_length(faltando, 1) is not null then
    return json_build_object('ok', false, 'codigo', 'faltando_dado',
      'numero', s.numero, 'faltando', to_json(faltando));
  end if;

  return json_build_object(
    'ok', true,
    'numero', s.numero,
    'empresa', json_build_object(
      'nome', emp.nome, 'inscricao_estadual', emp.inscricao_estadual,
      'documento', emp.documento, 'endereco', emp.endereco, 'bairro', emp.bairro,
      'cep', emp.cep, 'cidade', emp.cidade, 'uf', emp.uf, 'email', emp.email,
      'cobranca_endereco', emp.cobranca_endereco, 'cobranca_bairro', emp.cobranca_bairro,
      'cobranca_cep', emp.cobranca_cep, 'cobranca_cidade', emp.cobranca_cidade),
    'fornecedor', json_build_object(
      'razao_social', forn.razao_social, 'cnpj', forn.cnpj,
      'endereco', forn.endereco, 'bairro', forn.bairro, 'cep', forn.cep,
      'cidade', forn.cidade, 'uf', forn.uf, 'telefone', forn.telefone),
    'condicoes_pagamento', (select string_agg(coalesce(nullif(descricao_livre,''), descricao), ' · ' order by ordem)
                              from public.cotacao_pagamentos where cotacao_id = cot.id),
    'prazo_entrega', cot.prazo_entrega,
    'entrega_endereco', coalesce(nullif(trim(s.local_entrega),''), s.unidade_destino),
    'itens', v_itens,
    'total_liquido', v_total
  );
end;
$$;

revoke all on function public.ordem_de_compra_do_pedido(uuid) from anon, authenticated;
grant execute on function public.ordem_de_compra_do_pedido(uuid) to service_role;
