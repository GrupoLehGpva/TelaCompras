-- ============================================================================
-- Bateria de cadastro-fornecedores-e-exclusao.sql no banco de verdade.
-- Termina com uma exceção de propósito: tudo é desfeito, e a mensagem é o
-- relatório. "TESTES OK" = passou.
--
-- Usa documentos de teste válidos (dígito certo) que não existem no banco:
--   CPF 529.982.247-25 · CPF 123.456.789-09
--   CNPJ 11.222.333/0001-81 · CNPJ 45.454.545/0001-06
-- ============================================================================
select public.catalogo_definir_cadastrador('teste.bateria', 'Bateria de Teste', 'senha-certa-123');
select set_config('teste.log', '', true);
-- A chave pública não lê `fornecedores` (dado com CPF). O código de um
-- fornecedor que veio do GR é separado aqui, antes de virar anon.
select set_config('teste.forn_gr', (select codigo_gr from public.fornecedores
   where ativo and cadastrado_por is null order by codigo_gr limit 1), true);
set local role anon;

do $$
declare
  r jsonb; log text := '';
  item_gr text; nome_gr text; forn_gr text; doc_gr text; razao_gr text;
  L constant text := 'teste.bateria'; S constant text := 'senha-certa-123';
begin
  -- ----------------------------------------------------------- EXCLUIR ITEM
  select codigo, descricao into item_gr, nome_gr from public.catalogo_itens
   where ativo and not pendente_gr order by codigo limit 1;

  r := public.catalogo_salvar_item(L, 'errada', 'excluir', jsonb_build_object('codigo', item_gr));
  assert r->>'erro' = 'login_ou_senha', 'excluir senha errada: ' || r::text;

  r := public.catalogo_salvar_item(L, S, 'excluir', '{"codigo":"9999555"}');
  assert r->>'erro' = 'nao_encontrado', 'excluir inexistente: ' || r::text;

  r := public.catalogo_salvar_item(L, S, 'excluir',
         jsonb_build_object('codigo', item_gr, 'motivo', repeat('x', 301)));
  assert r->>'erro' = 'motivo_longo', 'motivo longo: ' || r::text;

  r := public.catalogo_salvar_item(L, S, 'excluir',
         jsonb_build_object('codigo', item_gr, 'motivo', 'Saiu de linha no GR'));
  assert (r->>'ok')::boolean and not (r->'item'->>'ativo')::boolean
     and (r->'item'->>'excluido')::boolean, 'excluir item do GR: ' || r::text;
  assert not exists (select 1 from public.catalogo_itens where codigo = item_gr and ativo),
     'formulário ainda vê o excluído';

  r := public.catalogo_salvar_item(L, S, 'excluir', jsonb_build_object('codigo', item_gr));
  assert r->>'erro' = 'ja_excluido', 'excluir duas vezes: ' || r::text;

  r := public.catalogo_salvar_item(L, S, 'criar',
         jsonb_build_object('codigo', item_gr, 'familia', 'MM', 'descricao', 'X Y Z', 'unidade', 'UNID'));
  assert r->>'erro' = 'codigo_inativo', 'criar sobre excluído oferece reativar: ' || r::text;

  -- "retirar" (nome antigo) continua funcionando para item pendente
  r := public.catalogo_salvar_item(L, S, 'criar',
         '{"codigo":"9999001","familia":"MM","descricao":"TESTE PENDENTE","unidade":"UNID"}');
  assert (r->>'ok')::boolean, 'criar pendente: ' || r::text;
  r := public.catalogo_salvar_item(L, S, 'retirar', '{"codigo":"9999001"}');
  assert (r->>'ok')::boolean and r->>'modo' = 'excluir', 'retirar vira excluir: ' || r::text;
  r := public.catalogo_salvar_item(L, S, 'reativar',
         '{"codigo":"9999001","familia":"MM","descricao":"TESTE PENDENTE","unidade":"UNID"}');
  assert (r->>'ok')::boolean and (r->'item'->>'ativo')::boolean
     and not (r->'item'->>'excluido')::boolean, 'reativar limpa excluido: ' || r::text;
  log := log || 'excluir item ok; ';

  -- ------------------------------------------------------- FORNECEDOR: CRIAR
  r := public.fornecedor_salvar(L, 'errada', 'criar', '{}');
  assert r->>'erro' = 'login_ou_senha', 'forn senha errada: ' || r::text;

  r := public.fornecedor_salvar(L, S, 'apagar', '{}');
  assert r->>'erro' = 'modo_invalido', 'forn modo: ' || r::text;

  r := public.fornecedor_salvar(L, S, 'criar', '{"codigo_gr":"abc"}');
  assert r->>'erro' = 'codigo_invalido' and r->>'campo' = 'codigo_gr', 'forn cod: ' || r::text;

  r := public.fornecedor_salvar(L, S, 'criar', '{"codigo_gr":"9999901","tipo_pessoa":"XX"}');
  assert r->>'erro' = 'tipo_invalido', 'forn tipo: ' || r::text;

  r := public.fornecedor_salvar(L, S, 'criar', '{"codigo_gr":"9999901","tipo_pessoa":"PF","documento":"529.982.247-24"}');
  assert r->>'erro' = 'documento_invalido', 'cpf dígito errado: ' || r::text;
  r := public.fornecedor_salvar(L, S, 'criar', '{"codigo_gr":"9999901","tipo_pessoa":"PF","documento":"111.111.111-11"}');
  assert r->>'erro' = 'documento_invalido', 'cpf repetido 1: ' || r::text;
  r := public.fornecedor_salvar(L, S, 'criar', '{"codigo_gr":"9999901","tipo_pessoa":"PJ","documento":"529.982.247-25"}');
  assert r->>'erro' = 'documento_invalido', 'cpf como PJ: ' || r::text;
  r := public.fornecedor_salvar(L, S, 'criar', '{"codigo_gr":"9999901","tipo_pessoa":"PJ","documento":"11.222.333/0001-80"}');
  assert r->>'erro' = 'documento_invalido', 'cnpj dígito errado: ' || r::text;

  r := public.fornecedor_salvar(L, S, 'criar', '{"codigo_gr":"9999901","tipo_pessoa":"PJ","documento":"11222333000181","razao_social":"AB"}');
  assert r->>'erro' = 'razao_invalida', 'razão curta: ' || r::text;
  r := public.fornecedor_salvar(L, S, 'criar', '{"codigo_gr":"9999901","tipo_pessoa":"PJ","documento":"11222333000181","razao_social":"TESTE LTDA","endereco":"R"}');
  assert r->>'erro' = 'endereco_invalido', 'endereço: ' || r::text;
  r := public.fornecedor_salvar(L, S, 'criar', '{"codigo_gr":"9999901","tipo_pessoa":"PJ","documento":"11222333000181","razao_social":"TESTE LTDA","endereco":"RUA A, 10","cep":"123"}');
  assert r->>'erro' = 'cep_invalido', 'cep: ' || r::text;
  r := public.fornecedor_salvar(L, S, 'criar', '{"codigo_gr":"9999901","tipo_pessoa":"PJ","documento":"11222333000181","razao_social":"TESTE LTDA","endereco":"RUA A, 10","cidade":""}');
  assert r->>'erro' = 'cidade_invalida', 'cidade: ' || r::text;
  r := public.fornecedor_salvar(L, S, 'criar', '{"codigo_gr":"9999901","tipo_pessoa":"PJ","documento":"11222333000181","razao_social":"TESTE LTDA","endereco":"RUA A, 10","cidade":"PALMEIRA","uf":"XX"}');
  assert r->>'erro' = 'uf_invalida', 'uf: ' || r::text;

  r := public.fornecedor_salvar(L, S, 'criar',
    '{"codigo_gr":"0009999901","tipo_pessoa":"pj","documento":"11222333000181","razao_social":"  TESTE   BATERIA LTDA ",
      "endereco":"RUA DAS FLORES, 100","bairro":"CENTRO","cep":"84130000","cidade":"PALMEIRA","uf":"pr"}');
  assert (r->>'ok')::boolean, 'criar PJ: ' || r::text;
  assert r->'fornecedor'->>'id' = '9999901' and r->'fornecedor'->>'codigo_gr' = '9999901'
     and r->'fornecedor'->>'cnpj' = '11.222.333/0001-81' and r->'fornecedor'->>'tipo_pessoa' = 'PJ'
     and r->'fornecedor'->>'razao_social' = 'TESTE BATERIA LTDA' and r->'fornecedor'->>'cep' = '84130-000'
     and r->'fornecedor'->>'uf' = 'PR' and r->'fornecedor'->>'cadastrado_por' = 'Bateria de Teste',
     'dados do PJ: ' || r::text;
  -- a busca que o comprador já usa acha o novo
  assert exists (select 1 from public.buscar_fornecedor('bateria') where id = '9999901'), 'buscar_fornecedor não acha';

  r := public.fornecedor_salvar(L, S, 'criar',
    '{"codigo_gr":"9999902","tipo_pessoa":"PF","documento":"52998224725","razao_social":"JOAO DE TESTE",
      "endereco":"LINHA RURAL, KM 5","cidade":"PALMEIRA","uf":"PR"}');
  assert (r->>'ok')::boolean and r->'fornecedor'->>'cnpj' = '529.982.247-25'
     and r->'fornecedor'->'cep' = 'null'::jsonb and r->'fornecedor'->'bairro' = 'null'::jsonb, 'criar PF: ' || r::text;

  -- duplicidades
  r := public.fornecedor_salvar(L, S, 'criar',
    '{"codigo_gr":"9999901","tipo_pessoa":"PJ","documento":"45454545000106","razao_social":"OUTRO",
      "endereco":"RUA B, 1","cidade":"PALMEIRA","uf":"PR"}');
  assert r->>'erro' = 'codigo_existe', 'código repetido: ' || r::text;
  r := public.fornecedor_salvar(L, S, 'criar',
    '{"codigo_gr":"9999903","tipo_pessoa":"PJ","documento":"11.222.333/0001-81","razao_social":"OUTRO NOME",
      "endereco":"RUA B, 1","cidade":"PALMEIRA","uf":"PR","confirmar_nome":true}');
  assert r->>'erro' = 'documento_repetido' and r->'fornecedor'->>'codigo_gr' = '9999901', 'cnpj repetido: ' || r::text;
  r := public.fornecedor_salvar(L, S, 'criar',
    '{"codigo_gr":"9999903","tipo_pessoa":"PJ","documento":"45454545000106","razao_social":"teste bateria ltda",
      "endereco":"RUA B, 1","cidade":"PALMEIRA","uf":"PR"}');
  assert r->>'erro' = 'nome_repetido', 'razão repetida: ' || r::text;
  r := public.fornecedor_salvar(L, S, 'criar',
    '{"codigo_gr":"9999903","tipo_pessoa":"PJ","documento":"45454545000106","razao_social":"teste bateria ltda",
      "endereco":"RUA B, 1","cidade":"PALMEIRA","uf":"PR","confirmar_nome":true}');
  assert (r->>'ok')::boolean, 'razão repetida confirmada (filial): ' || r::text;

  -- código de fornecedor que já veio do GR
  forn_gr := current_setting('teste.forn_gr');
  begin perform 1 from public.fornecedores limit 1; assert false, 'anon leu fornecedores';
  exception when insufficient_privilege then null; end;
  r := public.fornecedor_salvar(L, S, 'criar',
    jsonb_build_object('codigo_gr', forn_gr, 'tipo_pessoa','PF','documento','12345678909',
      'razao_social','QUALQUER','endereco','RUA C, 1','cidade','PALMEIRA','uf','PR'));
  assert r->>'erro' = 'codigo_existe', 'código do GR: ' || r::text;
  log := log || 'criar fornecedor ok; ';

  -- ------------------------------------------------------- BUSCAR
  r := public.fornecedor_buscar(L, 'errada', 'teste');
  assert r->>'erro' = 'login_ou_senha', 'buscar senha errada';
  r := public.fornecedor_buscar(L, S, 'b');
  assert jsonb_array_length(r->'fornecedores') = 0, 'termo curto';
  r := public.fornecedor_buscar(L, S, '9999901');
  assert r->'fornecedores'->0->>'codigo_gr' = '9999901', 'busca por código: ' || r::text;
  r := public.fornecedor_buscar(L, S, '529982');
  assert exists (select 1 from jsonb_array_elements(r->'fornecedores') e where e->>'codigo_gr' = '9999902'), 'busca por CPF: ' || r::text;
  r := public.fornecedor_buscar(L, S, 'bateria');
  assert (select count(*) from jsonb_array_elements(r->'fornecedores') e where e->>'codigo_gr' in ('9999901','9999903')) = 2, 'busca por nome: ' || r::text;
  log := log || 'buscar ok; ';

  -- ------------------------------------------------------- CORRIGIR
  r := public.fornecedor_salvar(L, S, 'corrigir',
    '{"codigo_gr":"9999902","tipo_pessoa":"PF","documento":"12345678909","razao_social":"JOAO DE TESTE FILHO",
      "endereco":"LINHA RURAL, KM 6","bairro":"INTERIOR","cep":"84130-000","cidade":"PALMEIRA","uf":"PR"}');
  assert (r->>'ok')::boolean and r->'fornecedor'->>'razao_social' = 'JOAO DE TESTE FILHO'
     and r->'fornecedor'->>'cnpj' = '123.456.789-09' and r->'fornecedor'->>'nome_curto' = 'JOAO DE TESTE FILHO',
     'corrigir: ' || r::text;
  r := public.fornecedor_salvar(L, S, 'corrigir',
    '{"codigo_gr":"9999555","tipo_pessoa":"PF","documento":"12345678909","razao_social":"X Y Z",
      "endereco":"RUA A, 1","cidade":"PALMEIRA","uf":"PR"}');
  assert r->>'erro' = 'nao_encontrado', 'corrigir inexistente: ' || r::text;
  log := log || 'corrigir ok; ';

  -- ------------------------------------------------------- EXCLUIR / REATIVAR
  r := public.fornecedor_salvar(L, S, 'excluir', '{"codigo_gr":"9999902","motivo":"Duplicado"}');
  assert (r->>'ok')::boolean and not (r->'fornecedor'->>'ativo')::boolean, 'excluir forn: ' || r::text;
  assert not exists (select 1 from public.buscar_fornecedor('filho') where id = '9999902'), 'comprador ainda acha o excluído';
  r := public.fornecedor_salvar(L, S, 'excluir', '{"codigo_gr":"9999902"}');
  assert r->>'erro' = 'ja_excluido', 'excluir 2x: ' || r::text;
  r := public.fornecedor_salvar(L, S, 'excluir', '{"codigo_gr":"9999555"}');
  assert r->>'erro' = 'nao_encontrado', 'excluir inexistente: ' || r::text;
  r := public.fornecedor_buscar(L, S, '9999902');
  assert r->'fornecedores'->0->>'ativo' = 'false', 'busca da tela mostra excluído: ' || r::text;
  r := public.fornecedor_salvar(L, S, 'criar',
    '{"codigo_gr":"9999902","tipo_pessoa":"PF","documento":"12345678909","razao_social":"JOAO",
      "endereco":"RUA A, 1","cidade":"PALMEIRA","uf":"PR"}');
  assert r->>'erro' = 'codigo_inativo', 'criar sobre excluído: ' || r::text;
  r := public.fornecedor_salvar(L, S, 'reativar',
    '{"codigo_gr":"9999902","tipo_pessoa":"PF","documento":"12345678909","razao_social":"JOAO DE TESTE FILHO",
      "endereco":"LINHA RURAL, KM 6","cidade":"PALMEIRA","uf":"PR"}');
  assert (r->>'ok')::boolean and (r->'fornecedor'->>'ativo')::boolean, 'reativar: ' || r::text;
  r := public.fornecedor_salvar(L, S, 'reativar',
    '{"codigo_gr":"9999902","tipo_pessoa":"PF","documento":"12345678909","razao_social":"JOAO DE TESTE FILHO",
      "endereco":"LINHA RURAL, KM 6","cidade":"PALMEIRA","uf":"PR"}');
  assert r->>'erro' = 'nao_reativavel', 'reativar ativo: ' || r::text;
  log := log || 'excluir/reativar fornecedor ok; ';

  -- a chave pública continua sem ler nem escrever direto
  begin perform * from public.fornecedores_historico; assert false, 'anon leu histórico de fornecedor';
  exception when insufficient_privilege then null; end;
  begin update public.fornecedores set ativo = false where id = '9999901';
    if found then assert false, 'anon alterou fornecedor'; end if;
  exception when insufficient_privilege then null; end;
  log := log || 'permissões ok; ';

  perform set_config('teste.log', log, true);
end $$;

reset role;

do $$
declare
  r json; log text := current_setting('teste.log');
  marca timestamptz := clock_timestamp() + interval '1 second';
  excl text; total_arquivo int; n int;
begin
  -- históricos
  select count(*) into n from public.fornecedores_historico where fornecedor_id in ('9999901','9999902','9999903');
  assert n = 6, 'histórico de fornecedor: ' || n;     -- 3 criar + corrigir + excluir + reativar
  assert (select motivo from public.fornecedores_historico where fornecedor_id = '9999902' and acao = 'excluir') = 'Duplicado', 'motivo forn';
  assert (select motivo from public.catalogo_itens_historico where acao = 'excluir' and motivo is not null limit 1) = 'Saiu de linha no GR', 'motivo item';
  assert (select count(*) from public.fornecedores where tipo_pessoa is null and coalesce(cnpj, '') <> '') = 0, 'tipo_pessoa não preenchido';

  -- IMPORTAÇÃO SIMULADA: o CSV traz todos os itens ativos E o item excluído
  select codigo into excl from public.catalogo_itens where excluido and not ativo limit 1;
  update public.catalogo_itens set ativo = true, atualizado_em = marca
   where (ativo and not pendente_gr) or codigo = excl;     -- o upsert manda ativo = true
  select count(*) into total_arquivo from public.catalogo_itens where atualizado_em = marca;
  assert not (select ativo from public.catalogo_itens where codigo = excl), 'importação ressuscitou o excluído';
  r := public.catalogo_desativar_antigos(marca);
  assert (r->>'ativos_agora')::int = total_arquivo, 'conferência do n8n não bate: ' || r::text;
  assert (r->>'excluidos_na_tela')::int = 1, 'excluídos: ' || r::text;
  assert (select ativo and pendente_gr from public.catalogo_itens where codigo = '9999001'), 'pendente sumiu';
  log := log || 'importação ok (' || r::text || '); ';

  raise exception 'TESTES OK: %', log;
end $$;
