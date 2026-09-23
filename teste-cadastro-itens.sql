-- ============================================================================
-- Bateria do cadastro de itens NO BANCO DE VERDADE, sem deixar rastro.
--
-- Roda tudo numa transação e termina com uma exceção de propósito: o Postgres
-- desfaz tudo (funções, colunas, itens de teste) e a mensagem da exceção é o
-- relatório. "TESTES OK" = passou. Qualquer outra mensagem = falhou.
--
-- Roda sozinho depois que cadastro-de-itens.sql já foi aplicado (já foi, em 23/09).
-- Antes disso, cole os dois juntos, na mesma execução:
--   (cat cadastro-de-itens.sql teste-cadastro-itens.sql) → SQL Editor → Run
-- ============================================================================
select public.catalogo_definir_cadastrador('  Teste.Bateria ', 'Bateria de Teste', 'senha-certa-123');
select set_config('teste.log', '', true);

-- --------------------------------------------------------------- COMO ANON ---
set local role anon;

do $$
declare
  r jsonb; log text := '';
  procedure_ok boolean;
  fam text := 'MM';
  un  text := 'UNID';
  nome_existente text;
begin
  -- 1. Senha errada: não entra, conta a tentativa
  r := public.catalogo_entrar('teste.bateria', 'errada');
  assert r->>'erro' = 'login_ou_senha' and (r->>'restam')::int = 4, 'senha errada: ' || r::text;
  -- 2. Login inexistente: mesma mensagem (não revela quem existe)
  r := public.catalogo_entrar('ninguem', 'x');
  assert r->>'erro' = 'login_ou_senha' and r->'restam' is null, 'login inexistente: ' || r::text;
  -- 3. Senha certa, login com maiúscula e espaço: entra, zera as falhas
  r := public.catalogo_entrar(' TESTE.bateria ', 'senha-certa-123');
  assert (r->>'ok')::boolean and r->>'nome' = 'Bateria de Teste', 'entrar: ' || r::text;
  assert jsonb_array_length(r->'unidades') >= 10, 'unidades: ' || (r->'unidades')::text;
  assert jsonb_array_length(r->'grupos') >= 50, 'grupos';
  assert r->'unidades'->>0 = 'UNID', 'unidade mais usada primeiro';
  log := log || 'entrar ok; ';

  -- 4. Anon NÃO lê as tabelas protegidas nem chama as funções internas
  begin perform * from public.catalogo_cadastradores; assert false, 'anon leu cadastradores';
  exception when insufficient_privilege then null; end;
  begin perform * from public.catalogo_itens_historico; assert false, 'anon leu historico';
  exception when insufficient_privilege then null; end;
  begin perform public._catalogo_autenticar('teste.bateria','senha-certa-123'); assert false, 'anon chamou interna';
  exception when insufficient_privilege then null; end;
  begin perform public.catalogo_definir_cadastrador('hacker','H','12345678'); assert false, 'anon criou login';
  exception when insufficient_privilege then null; end;
  begin perform public.catalogo_desativar_antigos(now()); assert false, 'anon desativou catalogo';
  exception when insufficient_privilege then null; end;
  begin insert into public.catalogo_itens(codigo,familia,descricao,unidade) values ('9999009','MM','x','UNID');
        assert false, 'anon inseriu direto';
  exception when insufficient_privilege then null; end;
  log := log || 'permissoes ok; ';

  -- 5. Salvar com senha errada: não grava
  r := public.catalogo_salvar_item('teste.bateria','errada','criar',
       '{"codigo":"9999001","familia":"MM","descricao":"ITEM DE TESTE A","unidade":"UNID"}');
  assert r->>'erro' = 'login_ou_senha', 'salvar senha errada: ' || r::text;
  assert not exists(select 1 from public.catalogo_itens where codigo='9999001'), 'gravou com senha errada';

  -- 6. Validações (cada uma diz o campo)
  r := public.catalogo_salvar_item('teste.bateria','senha-certa-123','criar','{"codigo":"12a","familia":"MM","descricao":"XYZ","unidade":"UNID"}');
  assert r->>'erro'='codigo_invalido' and r->>'campo'='codigo', 'cod letra: '|| r::text;
  r := public.catalogo_salvar_item('teste.bateria','senha-certa-123','criar','{"codigo":"000","familia":"MM","descricao":"XYZ","unidade":"UNID"}');
  assert r->>'erro'='codigo_invalido', 'cod zero: '|| r::text;
  r := public.catalogo_salvar_item('teste.bateria','senha-certa-123','criar','{"codigo":"12345678","familia":"MM","descricao":"XYZ","unidade":"UNID"}');
  assert r->>'erro'='codigo_invalido', 'cod longo: '|| r::text;
  r := public.catalogo_salvar_item('teste.bateria','senha-certa-123','criar','{"codigo":"9999001","familia":"ZZ","descricao":"XYZ","unidade":"UNID"}');
  assert r->>'erro'='familia_invalida', 'familia: '|| r::text;
  r := public.catalogo_salvar_item('teste.bateria','senha-certa-123','criar','{"codigo":"9999001","familia":"MM","descricao":"  X ","unidade":"UNID"}');
  assert r->>'erro'='descricao_invalida', 'desc curta: '|| r::text;
  r := public.catalogo_salvar_item('teste.bateria','senha-certa-123','criar',jsonb_build_object('codigo','9999001','familia','MM','descricao',repeat('A',151),'unidade','UNID'));
  assert r->>'erro'='descricao_invalida', 'desc longa: '|| r::text;
  r := public.catalogo_salvar_item('teste.bateria','senha-certa-123','criar','{"codigo":"9999001","familia":"MM","descricao":"XYZW","unidade":"Caixa"}');
  assert r->>'erro'='unidade_invalida', 'unidade: '|| r::text;
  r := public.catalogo_salvar_item('teste.bateria','senha-certa-123','apagar','{"codigo":"9999001"}');
  assert r->>'erro'='modo_invalido', 'modo: '|| r::text;
  r := public.catalogo_salvar_item('teste.bateria','senha-certa-123','criar','{}');
  assert r->>'erro'='codigo_invalido', 'vazio: '|| r::text;
  log := log || 'validacoes ok; ';

  -- 7. Criar: família minúscula e zero à esquerda são normalizados
  r := public.catalogo_salvar_item('teste.bateria','senha-certa-123','criar',
       '{"codigo":"09999001","familia":"mm","descricao":"  Item de Teste A 10mm ","unidade":"UNID","especificacao":" PEÇA "}');
  assert (r->>'ok')::boolean, 'criar: ' || r::text;
  assert r->'item'->>'codigo'='9999001' and r->'item'->>'familia'='MM'
     and r->'item'->>'descricao'='Item de Teste A 10mm' and r->'item'->>'especificacao'='PEÇA'
     and (r->'item'->>'pendente_gr')::boolean and r->'item'->>'cadastrado_por'='Bateria de Teste', 'item criado: '|| r::text;
  assert r->'pendentes'->0->>'codigo'='9999001', 'pendentes: '|| (r->'pendentes')::text;
  -- aparece para o formulário (que lê como anon, ativo=true)
  assert exists(select 1 from public.catalogo_itens where codigo='9999001' and ativo), 'formulario nao ve';
  log := log || 'criar ok; ';

  -- 8. Mesmo código de novo: não duplica, devolve o existente
  r := public.catalogo_salvar_item('teste.bateria','senha-certa-123','criar',
       '{"codigo":"9999001","familia":"MM","descricao":"OUTRO NOME","unidade":"UNID"}');
  assert r->>'erro'='codigo_existe' and r->'item'->>'descricao'='Item de Teste A 10mm', 'dup: '|| r::text;

  -- 9. Nome igual a item ativo (outro código, maiúscula diferente): pede confirmação
  select descricao into nome_existente from public.catalogo_itens where ativo and not pendente_gr order by codigo limit 1;
  r := public.catalogo_salvar_item('teste.bateria','senha-certa-123','criar',
       jsonb_build_object('codigo','9999002','familia','MM','descricao',lower(nome_existente),'unidade','UNID'));
  assert r->>'erro'='nome_repetido' and r->'item'->>'codigo' is not null, 'nome rep: '|| r::text;
  r := public.catalogo_salvar_item('teste.bateria','senha-certa-123','criar',
       jsonb_build_object('codigo','9999002','familia','MM','descricao',lower(nome_existente),'unidade','UNID','confirmar_nome',true));
  assert (r->>'ok')::boolean, 'nome rep confirmado: '|| r::text;
  log := log || 'duplicados ok; ';

  -- 10. Corrigir o pendente
  r := public.catalogo_salvar_item('teste.bateria','senha-certa-123','corrigir',
       '{"codigo":"9999001","familia":"HL","descricao":"Item de Teste A 12mm","unidade":"KG","especificacao":""}');
  assert (r->>'ok')::boolean and r->'item'->>'descricao'='Item de Teste A 12mm'
     and r->'item'->>'unidade'='KG' and r->'item'->'especificacao' = 'null'::jsonb, 'corrigir: '|| r::text;
  -- corrigir item que veio do GR: recusa
  r := public.catalogo_salvar_item('teste.bateria','senha-certa-123','corrigir',
       jsonb_build_object('codigo',(select codigo from public.catalogo_itens where ativo and not pendente_gr limit 1),
                          'familia','MM','descricao','HACK','unidade','UNID'));
  assert r->>'erro'='veio_do_gr', 'corrigir GR: '|| r::text;
  r := public.catalogo_salvar_item('teste.bateria','senha-certa-123','corrigir','{"codigo":"9999555","familia":"MM","descricao":"XYZ","unidade":"UNID"}');
  assert r->>'erro'='nao_encontrado', 'corrigir inexistente: '|| r::text;

  -- 11. Retirar o pendente, e depois reativar
  r := public.catalogo_salvar_item('teste.bateria','senha-certa-123','retirar','{"codigo":"9999002"}');
  assert (r->>'ok')::boolean and not (r->'item'->>'ativo')::boolean, 'retirar: '|| r::text;
  r := public.catalogo_salvar_item('teste.bateria','senha-certa-123','retirar',
       jsonb_build_object('codigo',(select codigo from public.catalogo_itens where ativo and not pendente_gr limit 1)));
  assert r->>'erro'='veio_do_gr', 'retirar GR: '|| r::text;
  r := public.catalogo_salvar_item('teste.bateria','senha-certa-123','criar',
       '{"codigo":"9999002","familia":"MM","descricao":"Item de Teste B","unidade":"UNID"}');
  assert r->>'erro'='codigo_inativo', 'criar inativo: '|| r::text;
  r := public.catalogo_salvar_item('teste.bateria','senha-certa-123','reativar',
       '{"codigo":"9999002","familia":"MM","descricao":"Item de Teste B","unidade":"UNID"}');
  assert (r->>'ok')::boolean and (r->'item'->>'ativo')::boolean and r->'item'->>'descricao'='Item de Teste B', 'reativar: '|| r::text;
  r := public.catalogo_salvar_item('teste.bateria','senha-certa-123','reativar',
       '{"codigo":"9999002","familia":"MM","descricao":"Item de Teste B","unidade":"UNID"}');
  assert r->>'erro'='nao_reativavel', 'reativar ativo: '|| r::text;
  log := log || 'corrigir/retirar/reativar ok; ';

  -- 12. Trocar senha
  r := public.catalogo_trocar_senha('teste.bateria','senha-certa-123','curta');
  assert r->>'erro'='senha_curta', 'senha curta: '|| r::text;
  r := public.catalogo_trocar_senha('teste.bateria','senha-certa-123','senha-certa-123');
  assert r->>'erro'='senha_igual', 'senha igual: '|| r::text;
  r := public.catalogo_trocar_senha('teste.bateria','senha-certa-123','outra-senha-456');
  assert (r->>'ok')::boolean, 'trocar: '|| r::text;
  r := public.catalogo_entrar('teste.bateria','senha-certa-123');
  assert r->>'erro'='login_ou_senha', 'senha velha ainda entra';
  r := public.catalogo_entrar('teste.bateria','outra-senha-456');
  assert (r->>'ok')::boolean, 'senha nova nao entra';
  log := log || 'trocar senha ok; ';

  -- 13. Trava: 5 erros seguidos bloqueiam, inclusive a senha certa
  for i in 1..4 loop
    r := public.catalogo_entrar('teste.bateria','errada');
    assert r->>'erro'='login_ou_senha' and (r->>'restam')::int = 5-i, 'tentativa '||i||': '|| r::text;
  end loop;
  r := public.catalogo_entrar('teste.bateria','errada');
  assert r->>'erro'='bloqueado', 'quinta: '|| r::text;
  r := public.catalogo_entrar('teste.bateria','outra-senha-456');
  assert r->>'erro'='bloqueado', 'senha certa durante bloqueio: '|| r::text;
  r := public.catalogo_salvar_item('teste.bateria','outra-senha-456','criar',
       '{"codigo":"9999003","familia":"MM","descricao":"Durante bloqueio","unidade":"UNID"}');
  assert r->>'erro'='bloqueado', 'salvar durante bloqueio: '|| r::text;
  log := log || 'trava ok; ';

  perform set_config('teste.log', log, true);
end $$;

reset role;

-- ------------------------------------------------- COMO POSTGRES (n8n/admin) ---
do $$
declare
  r json; log text := current_setting('teste.log');
  marca timestamptz := clock_timestamp() + interval '1 second';
  sai text; ativos_antes int; n_hist int;
begin
  -- trava vence com o tempo
  update public.catalogo_cadastradores set bloqueado_ate = now() - interval '1 second' where login='teste.bateria';
  assert (public.catalogo_entrar('teste.bateria','outra-senha-456')->>'ok')::boolean, 'nao destravou';

  -- histórico: criar, criar(9999002), corrigir, retirar, reativar = 5
  select count(*) into n_hist from public.catalogo_itens_historico where codigo in ('9999001','9999002');
  assert n_hist = 5, 'historico: ' || n_hist;
  assert (select por from public.catalogo_itens_historico where codigo='9999001' and acao='corrigir') = 'Bateria de Teste', 'quem';
  assert (select antes->>'descricao' from public.catalogo_itens_historico where codigo='9999001' and acao='corrigir') = 'Item de Teste A 10mm', 'antes';
  -- a senha não está em lugar nenhum em texto
  assert not exists(select 1 from public.catalogo_cadastradores where senha_hash like '%senha%'), 'senha em claro';
  log := log || 'historico ok; ';

  -- SIMULA A IMPORTAÇÃO: o CSV traz todo mundo menos UM item do GR (sai),
  -- traz o pendente 9999002 (o GR confirmou) e NÃO traz o pendente 9999001.
  select codigo into sai from public.catalogo_itens where ativo and not pendente_gr order by codigo limit 1;
  select count(*) into ativos_antes from public.catalogo_itens where ativo;
  update public.catalogo_itens set atualizado_em = marca
   where ativo and not pendente_gr and codigo <> sai;
  update public.catalogo_itens set atualizado_em = marca, descricao = 'NOME NO GR'
   where codigo = '9999002';
  r := public.catalogo_desativar_antigos(marca);

  assert not (select ativo from public.catalogo_itens where codigo = sai), 'item que saiu do CSV continuou ativo';
  assert (select ativo and pendente_gr from public.catalogo_itens where codigo='9999001'), 'pendente fora do CSV sumiu';
  assert (select ativo and not pendente_gr and descricao='NOME NO GR' from public.catalogo_itens where codigo='9999002'), 'pendente confirmado';
  -- o número que o n8n compara: itens no arquivo = ativos_agora
  assert (r->>'ativos_agora')::int = (select count(*) from public.catalogo_itens where atualizado_em = marca), 'ativos_agora: '|| r::text;
  assert (r->>'ativos_agora')::int = ativos_antes - 3 + 1, 'conta do arquivo: '|| r::text||' antes='||ativos_antes;
  assert (r->>'ativos_total')::int = (r->>'ativos_agora')::int + 1, 'total: '|| r::text;
  assert (r->>'aguardando_gr')::int = 1 and (r->>'confirmados_pelo_gr')::int = 1 and (r->>'desativados')::int = 1, 'contagens: '|| r::text;
  log := log || 'importacao ok (' || r::text::text || '); ';

  raise exception 'TESTES OK: %', log;
end $$;
