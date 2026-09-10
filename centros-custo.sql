-- ============================================================================
-- Centros de custo · Grupo Leh — lista enxuta
-- Gerado de "centros de custos.xlsx" (relatório "006 - Centros de custos").
-- 90 centros.
--
-- MUDANÇA IMPORTANTE EM RELAÇÃO À CARGA ANTERIOR
-- A carga de 01/09 tinha 746 centros, um para cada talhão de safra. Esta lista
-- tem 90 — todos já existiam. Os outros 656 NÃO são apagados: viram ativo =
-- false, somem da busca do formulário, e continuam existindo para as
-- solicitações antigas conseguirem mostrar o nome do centro delas.
--
-- Esta planilha não traz a coluna Tipo (Produtivo / Não Produtivo). O tipo que
-- já está gravado é preservado — o insert abaixo não mexe nessa coluna.
--
-- COMO RODAR: cole o arquivo inteiro no SQL Editor do Supabase e clique em Run
-- UMA vez só. Espere terminar. Pode rodar de novo sempre que a lista mudar.
-- ============================================================================

create table if not exists public.centros_custo (
  codigo    text primary key,
  nome      text not null,
  unidade   text,
  tipo      text,
  ativo     boolean not null default true,
  buscavel  text generated always as (codigo || ' ' || nome || ' ' || coalesce(unidade,'')) stored
); alter table public.centros_custo enable row level security;
drop policy if exists "centros_custo leitura publica" on public.centros_custo;
create policy "centros_custo leitura publica"
  on public.centros_custo for select using (true);

create index if not exists centros_custo_busca_idx
  on public.centros_custo using gin (to_tsvector('portuguese', buscavel)); -- ---------------------------------------------------------------------------
-- PASSO 1 — desliga todo mundo. O insert do passo 2 religa quem está na
-- planilha de hoje.
-- ---------------------------------------------------------------------------
update public.centros_custo set ativo = false;

-- ---------------------------------------------------------------------------
-- PASSO 2 — sobe a planilha. Quem já existe é atualizado e religado; o tipo
-- gravado antes fica como está.
-- ---------------------------------------------------------------------------
insert into public.centros_custo (codigo, nome, unidade) values
  ('18', 'AÇOUGUE NORICUM', 'AÇOUGUE NORICUM'), ('3488', 'ALMOXARIFADO NORICUM', 'ALMOXARIFADO NORICUM'), ('1727', 'BIOFERTILIZAÇÃO', 'BIOFERTILIZAÇÃO'), ('3176', 'COMERCIAL', 'ESCRITÓRIO CENTRAL-E.RIOS'), ('1994', 'CONFINAMENTO DE BOVINOS', 'PECUÁRIA'), ('2135', 'COORD. RH - 109/110/111/210/211', 'GERÊNCIA SUINOCULTURA'), ('2192', 'COORD. ( NÚCLEO, NOVOSELO,MASTEKE) - ADILSON', 'GERÊNCIA SUINOCULTURA'), ('3238', 'COORD. FÁBRICA DE RAÇÃO', 'FÁBRICA DE RAÇÃO-FAN'), ('2193', 'COORD. PECUÁRIA E FLORESTAL', 'PECUÁRIA'), ('1717', 'DIRETORIA', 'DIRETORIA'), ('19', 'ESCRITÓRIO CENTRAL', 'ESCRITÓRIO CENTRAL-E.RIOS'), ('20', 'FÁBRICA DE RAÇÕES', 'FÁBRICA DE RAÇÃO-FAN'), ('1814', 'FAZENDA ÁGUAS BELAS', 'AGRICULTURA SUL'), ('2925', 'FAZENDA JATOBÁ AGROPECUÁRIA LTDA', 'PESSOA JURÍDICA - FAZENDA JATOBÁ'), ('1767', 'FAZENDA NORICUM AGROPECUÁRIA LTDA', 'AGRICULTURA SUL'), ('3467', 'GER. UPL E RH-215', 'RHAETIA 215 - NOVA ESTÂNCIA'), ('1723', 'GERÊNCIA (RH-101/201/107/207)', 'GERÊNCIA SUINOCULTURA'), ('2787', 'GERÊNCIA (TERMINAÇÃO)', 'GERÊNCIA SUINOCULTURA'), ('2786', 'GERÊNCIA (UPL PINHAO)', 'GERÊNCIA SUINOCULTURA'), ('1719', 'GERÊNCIA AGRICOLA SUL', 'AGRICULTURA SUL'), ('1721', 'GERÊNCIA GERAL SUINOCULTURA', 'GERÊNCIA SUINOCULTURA'), ('2324', 'MANUTENÇÃO', 'MANUTENÇÕES'), ('2149', 'MESA FINANCEIRA - CAPITAL DE GIRO', 'MESA FINANCEIRA- CAPITAL DE GIRO'), ('2415', 'PARCERIA - GRANJAS NÚCLEO', 'PARCERIA GRANJAS NÚCLEO'), ('2133', 'PEC - BAIA 01 - NORICUM', 'PECUÁRIA CONFINAMENTO'), ('3638', 'PEC - BAIA 01 - PINHÃO', 'PECUÁRIA CONFINAMENTO'), ('2221', 'PEC - BAIA 02 - NORICUM', 'PECUÁRIA CONFINAMENTO'), ('3639', 'PEC - BAIA 02 - PINHÃO', 'PECUÁRIA CONFINAMENTO'), ('3640', 'PEC - BAIA 03 - PINHÃO', 'PECUÁRIA CONFINAMENTO'), ('3641', 'PEC - BAIA 04 - PINHÃO', 'PECUÁRIA CONFINAMENTO'), ('3642', 'PEC - BAIA 05 - PINHÃO', 'PECUÁRIA CONFINAMENTO'), ('3643', 'PEC - BAIA 06 - PINHÃO', 'PECUÁRIA CONFINAMENTO'), ('3644', 'PEC - BAIA 07 - PINHÃO', 'PECUÁRIA CONFINAMENTO'), ('3645', 'PEC - BAIA 08 - PINHÃO', 'PECUÁRIA CONFINAMENTO'), ('2603', 'PEC - MATRIZES BOVINA', 'PECUÁRIA'), ('3253', 'PEC - PIQUETE 01 - NORICUM', 'PECUÁRIA'), ('3669', 'PEC - PIQUETE 01 - PINHÃO', 'PECUÁRIA'), ('2790', 'PEC - PIQUETE 02 - NORICUM', 'PECUÁRIA'), ('3684', 'PEC - PIQUETE 02 - PINHÃO', 'PECUÁRIA'), ('2791', 'PEC - PIQUETE 03 - NORICUM', 'PECUÁRIA'), ('3685', 'PEC - PIQUETE 03 - PINHÃO', 'PECUÁRIA'), ('2792', 'PEC - PIQUETE 04 - NORICUM', 'PECUÁRIA'), ('3686', 'PEC - PIQUETE 04 - PINHÃO', 'PECUÁRIA'), ('2793', 'PEC - PIQUETE 05 - NORICUM', 'PECUÁRIA'), ('3687', 'PEC - PIQUETE 05 - PINHÃO', 'PECUÁRIA'), ('2794', 'PEC - PIQUETE 06 - NORICUM', 'PECUÁRIA'), ('3256', 'PEC - PIQUETE 07 - NORICUM', 'PECUÁRIA'), ('2796', 'PEC - PIQUETE 08 - NORICUM', 'PECUÁRIA'), ('3022', 'PEC - PIQUETE 09 - NORICUM', 'PECUÁRIA'), ('3255', 'PEC - PIQUETE 10 - NORICUM', 'PECUÁRIA'), ('3458', 'PEC - PIQUETE 10.1 - NORICUM', 'PECUÁRIA'), ('3254', 'PEC - PIQUETE 11 - NORICUM', 'PECUÁRIA'), ('3243', 'PEC - PIQUETE 12 - NORICUM', 'PECUÁRIA'), ('23', 'PECUÁRIA NORICUM', 'PECUÁRIA'), ('3492', 'PECUÁRIA PINHÃO', 'PECUÁRIA'), ('24', 'REFLORESTAMENTO', 'REFLORESTAMENTO'), ('31', 'RESIDÊNCIA', 'RESIDÊNCIA'), ('1636', 'RHAETIA 101 - UPL - PADRÃO', 'RHAETIA 101 - CADEADO'), ('1638', 'RHAETIA 103 - UPL - PADRÃO', 'RHAETIA 103 - STOETZER'), ('1639', 'RHAETIA 104 - UPL - PADRÃO', 'RHAETIA 104 - ALECRIM'), ('1640', 'RHAETIA 105 - UPL - PADRÃO', 'RHAETIA 105 - ALCEU LUPEPSA'), ('1641', 'RHAETIA 106 - UPL - PADRÃO', 'RHAETIA 106 - ARTÊMIO'), ('1642', 'RHAETIA 107 - UPL - PADRÃO', 'RHAETIA 107 - SCHERER'), ('1918', 'RHAETIA 109 - UPL - PADRÃO', 'RHAETIA 109 - MASTEKE'), ('1643', 'RHAETIA 110 - UPL - PADRÃO', 'RHAETIA 110 - NOVOSELO'), ('1644', 'RHAETIA 111 - UPL - PADRÃO', 'RHAETIA 111 - NÚCLEO'), ('2073', 'RHAETIA 112 - UPL - PADRÃO', 'RHAETIA 112 - PASSO DA LONTRA'), ('3026', 'RHAETIA 113 - LAPA', 'RHAETIA 113 - LAPA'), ('3302', 'RHAETIA 115 - TAIPA', 'RHAETIA 115 - TAIPA'), ('1645', 'RHAETIA 201 - TERM. PADRÃO', 'RHAETIA 201 - CADEADO'), ('1578', 'RHAETIA 202 - TERM. PADRÃO', 'RHAETIA 202 - ÁGUAS BELAS'), ('1646', 'RHAETIA 203 - TERM. PADRÃO', 'RHAETIA 203 - STOETZER'), ('1581', 'RHAETIA 204 - TERM. PADRÃO', 'RHAETIA 204 - ROMANA'), ('1590', 'RHAETIA 205 - TERM. PADRÃO', 'RHAETIA 205 - MATADOURO'), ('1647', 'RHAETIA 206 - TERM. PADRÃO', 'RHAETIA 206 - PLETZ'), ('1648', 'RHAETIA 207 - TERM. PADRÃO', 'RHAETIA 207 - SCHERER'), ('1622', 'RHAETIA 208 - TERM. PADRÃO', 'RHAETIA 208 - ÁGUAS BELAS'), ('1649', 'RHAETIA 209 - TERM. PADRÃO', 'RHAETIA 209 - J. STECHER'), ('1650', 'RHAETIA 210 - TERM. PADRÃO', 'RHAETIA 210 - NOVOSELO'), ('1651', 'RHAETIA 211 - TERM. PADRÃO', 'RHAETIA 211 - NÚCLEO'), ('2075', 'RHAETIA 212 - UPL - PADRÃO', 'RHAETIA 212 - PASSO DA LONTRA'), ('2945', 'RHAETIA 213 - LAPA', 'RHAETIA 213 - LAPA'), ('2920', 'RHAETIA 214 - DETLINGER', 'RHAETIA 214 - DETLINGER'), ('3021', 'RHAETIA 215 - NOVA ESTÂNCIA', 'RHAETIA 215 - NOVA ESTÂNCIA'), ('1652', 'RHAETIA CENTRAL COLETAS PADRÃO', 'RHAETIA CENTRAL COLETAS'), ('3487', 'SUINOCULTURA', 'SUINOCULTURA GERAL'), ('21', 'TRANSPORTE DE LEITÕES E VENDA DE SUÍNOS', 'TRANSPORTES SUINOCULTURA'), ('1718', 'TRANSPORTE DE RAÇÕES', 'TRANSPORTES FÁBRICA DE RAÇÃO'), ('3246', 'TRANSPORTE PIAUÍ', 'TRANSPORTE PIAUÍ'), ('1769', 'TRANSPORTES AGRICULTURA', 'TRANSPORTES AGRICULTURA')
on conflict (codigo) do update
  set nome    = excluded.nome,
      unidade = excluded.unidade,
      ativo   = true;

-- ---------------------------------------------------------------------------
-- Conferência. Tem que voltar: ativos = 90, inativos = 656, total = 746.
-- ---------------------------------------------------------------------------
select count(*) filter (where ativo)     as ativos,
       count(*) filter (where not ativo) as inativos,
       count(*)                          as total
  from public.centros_custo;
