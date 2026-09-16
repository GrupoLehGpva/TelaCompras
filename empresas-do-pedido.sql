-- ============================================================================
-- A EMPRESA DO PEDIDO DE COMPRA
--
-- No GR a requisição pede **Empresa** logo abaixo do solicitante, antes do
-- centro de custos. São 6 pessoas jurídicas: três titulares × dois estados.
--
-- NÃO dá para deduzir a empresa do centro de custo. Era a hipótese, e o dado
-- derrubou: `centros_custo.unidade` guarda coisas como 'PECUÁRIA',
-- 'RHAETIA 215 - NOVA ESTÂNCIA', 'AGRICULTURA SUL' — de 49 unidades, só uma
-- diz o estado ('TRANSPORTE PIAUÍ'). Então a empresa é escolha de quem pede.
--
-- Os nomes ficam gravados EXATAMENTE como aparecem na lista do GR, incluindo o
-- espaçamento irregular ('LEH-PI' sem espaços, 'LEH - PR' com). Não é desleixo:
-- o RPA que um dia vai preencher o GR casa a opção pelo texto, e "arrumar" o
-- espaçamento aqui é entregar ao robô uma string que não existe lá.
-- ============================================================================

create table if not exists public.empresas (
  id      text primary key,
  nome    text not null unique,
  uf      text not null check (uf in ('PR','PI')),
  titular text not null,
  ordem   int  not null default 0,
  ativo   boolean not null default true,

  -- Dados de faturamento, para a ordem de compra (ver a imagem da OC 3862:
  -- inscrição estadual, documento, endereço da fazenda, e-mail). Chegam
  -- depois; a estrutura fica pronta agora para não ter que mexer na tabela no
  -- meio do item da ordem de compra.
  inscricao_estadual text,
  documento          text,
  endereco           text,
  bairro             text,
  cep                text,
  cidade             text,
  email              text,

  atualizado_em timestamptz not null default now()
);

insert into public.empresas (id, nome, uf, titular, ordem) values
  ('elke-pi',      'ELKE MONIKA ZUBER LEH-PI',    'PI', 'ELKE MONIKA ZUBER LEH',    1),
  ('elke-pr',      'ELKE MONIKA ZUBER LEH - PR',  'PR', 'ELKE MONIKA ZUBER LEH',    2),
  ('rainer-pi',    'RAINER MATHIAS LEH - PI',     'PI', 'RAINER MATHIAS LEH',       3),
  ('rainer-pr',    'RAINER MATHIAS LEH - PR',     'PR', 'RAINER MATHIAS LEH',       4),
  ('wienfried-pi', 'WIENFRIED MATTHIAS LEH - PI', 'PI', 'WIENFRIED MATTHIAS LEH',   5),
  ('wienfried-pr', 'WIENFRIED MATTHIAS LEH - PR', 'PR', 'WIENFRIED MATTHIAS LEH',   6)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- A LEITURA PÚBLICA É POR COLUNA, NÃO PELA TABELA INTEIRA
--
-- Primeira versão desta migração liberou SELECT em `empresas` inteira para a
-- chave publicável — e a tabela tem, ou vai ter, inscrição estadual, documento
-- e endereço de faturamento. A ordem de compra do GR mostra exatamente esses
-- campos. Publicar isso num repositório público é problema de LGPD, não
-- detalhe. Corrigido no mesmo dia.
--
-- RLS é por LINHA, não por coluna. A trava certa aqui é GRANT por coluna: quem
-- tem a chave publicável enxerga o que o formulário precisa para montar a
-- lista, e mais nada. Pedir uma coluna fora da lista dá erro em vez de
-- devolver dado.
-- ---------------------------------------------------------------------------
alter table public.empresas enable row level security;
drop policy if exists "empresas leitura publica" on public.empresas;
create policy "empresas leitura publica" on public.empresas
  for select to public using (ativo);

revoke all on table public.empresas from anon, authenticated;
grant select (id, nome, uf, titular, ordem, ativo)
  on table public.empresas to anon, authenticated;

-- A solicitação guarda qual empresa foi escolhida.
alter table public.solicitacoes
  add column if not exists empresa_id text references public.empresas(id);

-- ---------------------------------------------------------------------------
-- O que muda nas funções (corpo completo no banco):
--
--   criar_solicitacao  →  aceita `empresa_id`, e RECUSA id que não está na
--                         lista. A tela cobra a escolha; aqui se cobra que a
--                         escolha exista — aceitar texto livre num campo que o
--                         ERP vai consumir é entregar ao RPA uma empresa que
--                         não está no GR. Devolve `empresa_nome` para o card.
--
--   abrir_pedido       →  devolve `empresa_nome` junto do pedido. Os dados de
--                         faturamento NÃO vão: esta função é lida por qualquer
--                         um com o link do pedido.
-- ---------------------------------------------------------------------------
